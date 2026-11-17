/*
 * End-to-end check against a REAL DSH session log.
 *
 * test/reasoning.cjs uses synthetic fixtures. This harness feeds an actual
 * session.v4.jsonl.zstd (which contains real `reasoning` content blocks) into
 * the plugin's projection and renders the tree, so the whole data path is
 * exercised: zstd frames -> JSONL -> event window -> projectTurns -> cards.
 *
 * What it asserts:
 *   1. turns are projected and at least one carries reasoning;
 *   2. the reasoning obeys the 12000-char cap;
 *   3. the announced dropped count is exactly `total - kept`, where `total` is
 *      summed independently from the raw `assistant/message` blocks;
 *   4. the reasoning section renders, in both languages.
 *
 * A log whose model simply never reasoned is a SKIP (exit 0), not a failure.
 *
 * Usage: node test/real-log.cjs <path-to-session.v4.jsonl.zstd>
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const REASONING_LIMIT = 12000;

const logPath = process.argv[2];
if (!logPath) {
  console.error('usage: node test/real-log.cjs <session.v4.jsonl.zstd>');
  process.exit(2);
}

// ------------------------------------------------------------------ the log
const raw = fs.readFileSync(logPath);
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const starts = [];
let at = raw.indexOf(MAGIC);
while (at >= 0) { starts.push(at); at = raw.indexOf(MAGIC, at + 4); }
let text = '';
let badFrames = 0;
for (let i = 0; i < starts.length; i += 1) {
  const slice = raw.subarray(starts[i], i + 1 < starts.length ? starts[i + 1] : raw.length);
  try { text += zlib.zstdDecompressSync(slice).toString('utf8'); } catch { badFrames += 1; }
}
const records = [];
let badLines = 0;
for (const line of text.split('\n')) {
  if (!line.trim()) continue;
  try { records.push(JSON.parse(line)); } catch { badLines += 1; }
}
// A truncated or corrupt read must not be silently reported as OK.
if (badFrames || badLines) {
  console.error(`FAIL: ${badFrames} unreadable zstd frames, ${badLines} unparsable JSONL lines`);
  process.exit(1);
}

// Independent truth for the dropped count: reasoning summed per turn.
//
// A card is one turn and the accumulator resets at every `turn/start`, so a
// node only ever holds ITS turn's reasoning. Summing the whole log would be
// wrong on any session with more than one reasoning turn.
const reasoningByTurn = new Map();
const turnOfSeq = new Map();
for (const record of records) {
  if (record.type !== 'assistant/message') continue;
  if (typeof record.seq === 'number') turnOfSeq.set(record.seq, record.data.turn);
  const content = (record.data && record.data.message && record.data.message.content) || [];
  if (!Array.isArray(content)) continue;
  const blocks = content
    .filter((block) => block && block.type === 'reasoning' && typeof block.text === 'string')
    .map((block) => block.text)
    .filter((text) => text.trim());
  if (!blocks.length) continue;
  const turn = record.data.turn;
  reasoningByTurn.set(turn, (reasoningByTurn.get(turn) || 0) + blocks.join('\n\n').length);
}
let expectedTotal = 0;
for (const chars of reasoningByTurn.values()) expectedTotal += chars;

// A durable log holds no `assistant/live-chunk` rows, so this harness covers
// the settled path only — the live tail is covered by test/reasoning.cjs.
const entries = records.map((record) => ({ type: 'event', event: record }));

// ------------------------------------------------------------- plugin mount
const React = {
  createElement: (type, props, ...kids) => ({
    type,
    props: { ...(props || {}), children: kids.length === 0 ? (props || {}).children : (kids.length === 1 ? kids[0] : kids) },
  }),
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useEffect: () => {},
  useRef: (value) => ({ current: value === undefined ? null : value }),
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  Component: class {
    constructor(props) { this.props = props; this.state = {}; }
    setState(patch) { Object.assign(this.state, patch); }
  },
};
const storage = new Map();
const timers = new Map();
let nextTimerId = 1;
const win = {
  console,
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, value),
  },
  addEventListener() {}, removeEventListener() {},
  setTimeout: (fn) => { timers.set(nextTimerId, fn); nextTimerId += 1; return nextTimerId - 1; },
  clearTimeout: (id) => timers.delete(id),
  confirm: () => false,
  __ModuleLoader__: { load(def) { global.__module = def.factory((name) => (name === 'react' ? React : require(name))); } },
};
const doc = {
  documentElement: { lang: 'zh-CN' },
  getElementById: () => null,
  head: { appendChild: () => {} },
  createElement: () => ({ textContent: '', id: '' }),
};
const code = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');
// eslint-disable-next-line no-new-func
new Function('window', 'document', code)(win, doc);

const localeState = { dicts: new Map(), active: 'zh' };
const localeService = {
  register(ns, dicts) { localeState.dicts.set(ns, dicts); return () => {}; },
  bind(ns) {
    return (key, params) => {
      const dicts = localeState.dicts.get(ns) || {};
      const chain = localeState.active === 'zh' ? ['zh', 'en'] : ['en'];
      let template = key;
      for (const locale of chain) {
        const value = dicts[locale] && dicts[locale][key];
        if (value !== undefined) { template = value; break; }
      }
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
    };
  },
  subscribe: () => () => {},
};
let captured = null;
const binding = {
  eventSource: { getSnapshot: () => ({ entries, hasMore: false }), subscribe: () => () => {} },
  session: { getSnapshot: () => ({ running: false, openState: 'open' }), loadOlder: async () => {} },
};
global.__module.apply({
  slots: {
    inject: (slot, cb) => cb(),
    register: (options, component) => { captured = { options, component }; return () => {}; },
  },
  sessions: {
    binding: (id) => (id === 'real' ? binding : undefined),
    retain: () => ({ ready: Promise.resolve(undefined) }),
    fork: async () => { throw new Error('not used'); },
  },
  workspaces: {},
  locale: localeService,
  effect: (fn) => fn(),
});
const api = captured.options.inject().api;

// ----------------------------------------------------------------- project
const store = api.storeFor('real');
api.ensureProjection('real', store);
const nodes = store.getSnapshot().nodes;

const seen = [];
function walk(el) {
  if (el === null || el === undefined || el === false) return;
  if (typeof el === 'string' || typeof el === 'number') {
    const t = String(el);
    if (t.trim()) seen.push(t);
    return;
  }
  if (Array.isArray(el)) { el.forEach(walk); return; }
  const { type, props } = el;
  const children = [];
  if (props && props.children !== undefined) children.push(props.children);
  if (typeof type === 'string') { children.forEach(walk); return; }
  if (typeof type !== 'function') return;
  if (type.prototype instanceof React.Component) { walk(new type(props).render()); return; }
  walk(type(props));
}
function renderText() {
  seen.length = 0;
  walk(captured.component({ sessionId: 'real', api }));
  return seen.join(' ');
}

// ----------------------------------------------------------------- report
const withReasoning = nodes.filter((node) => (node.reasoning || '').trim());
console.log('log                 :', logPath);
console.log('records             :', records.length, '| reasoning turns:', reasoningByTurn.size);
console.log('projected turns     :', nodes.length);
console.log('turns with reasoning:', withReasoning.length);
if (expectedTotal) console.log('reasoning chars     :', expectedTotal);

if (!nodes.length) {
  // An empty session (a header and nothing else) has nothing to project; that
  // is correct behaviour, not a failure.
  const hasTurns = records.some((record) => record.type === 'turn/start');
  if (!hasTurns) {
    console.log('SKIP: this session recorded no turns (nothing to verify)');
    process.exit(0);
  }
  console.error('FAIL: no turns projected from a session that has turn/start');
  process.exit(1);
}
if (!withReasoning.length) {
  // A model that never thinks is correct plugin behaviour, not a failure.
  console.log('SKIP: this session recorded no reasoning (nothing to verify)');
  process.exit(0);
}

let failures = 0;
const kept = withReasoning.reduce((sum, node) => sum + node.reasoning.length, 0);
const dropped = withReasoning.reduce((sum, node) => sum + (node.reasoningDropped || 0), 0);
console.log('kept / dropped      :', kept, '/', dropped);

// The cap applies per node.
const overCap = withReasoning.filter((node) => node.reasoning.length > REASONING_LIMIT + 32);
if (overCap.length) {
  console.error(`FAIL: ${overCap.length} node(s) exceeded the cap, worst `
    + Math.max(...overCap.map((node) => node.reasoning.length)));
  failures += 1;
}
// The dropped count is exact per block, but `kept` also carries the `\n\n`
// separators the join inserts between blocks, which a per-block sum does not.
// So the invariant is: total - kept <= dropped <= total, and the gap is
// exactly those separators (an even number).
//
// A node only holds its own turn's reasoning. `answerSeq` is the seq of the
// `assistant/message` that settled that turn, and the log maps that seq to its
// turn, so the pairing is exact rather than positional.
let checkedTurns = 0;
for (const node of withReasoning) {
  const turn = turnOfSeq.get(node.answerSeq);
  const total = turn === undefined ? undefined : reasoningByTurn.get(turn);
  if (total === undefined) continue;
  checkedTurns += 1;
  const nodeKept = node.reasoning.length;
  const nodeDropped = node.reasoningDropped || 0;
  const lower = total - nodeKept;
  if (nodeDropped < lower) {
    console.error(`FAIL: turn ${turn} dropped too low — ${nodeDropped} < ${lower} (kept ${nodeKept}, total ${total})`);
    failures += 1;
  }
  if (nodeDropped > total) {
    console.error(`FAIL: turn ${turn} dropped too high — ${nodeDropped} > total ${total}`);
    failures += 1;
  }
  const separators = nodeDropped + nodeKept - total;
  if (separators < 0 || separators % 2 !== 0) {
    console.error(`FAIL: turn ${turn} impossible bookkeeping — kept + dropped - total = ${separators}`);
    failures += 1;
  }
}
console.log('turns reconciled    :', checkedTurns);

const zhText = renderText();
if (zhText.indexOf('思考过程') < 0) {
  console.error('FAIL: the reasoning section did not render (zh)');
  failures += 1;
}
localeState.active = 'en';
const enText = renderText();
if (enText.indexOf('Reasoning') < 0) {
  console.error('FAIL: the reasoning section did not render (en)');
  failures += 1;
}
// No "zh leaked" assertion here: the reasoning body is arbitrary model text
// and may legitimately contain any language. The tab label is the honest check.
if (captured.options.label() !== 'Infinite Exploration') {
  console.error('FAIL: the tab label did not follow the language: ' + captured.options.label());
  failures += 1;
}

console.log(failures ? 'REAL LOG FAILED' : 'REAL LOG OK');
process.exit(failures ? 1 : 0);
