/*
 * Persistence-policy test for reasoning.
 *
 * Reasoning is deliberately NOT written to the localStorage snapshot: it is
 * the one field that can reach tens of kilobytes per node, and this snapshot
 * also carries the parent links, which cannot be rebuilt from anywhere. If the
 * snapshot outgrew the quota, the tree would silently flatten.
 *
 * What must still hold:
 *   1. the snapshot does not contain the reasoning text;
 *   2. after a reload the reasoning comes back from the session log;
 *   3. the parent links survive the round trip.
 *
 * Runs in plain Node — fake React, no browser, no bundler.
 */
const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');

function makeHost() {
  const storage = new Map();
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
  const data = new Map();
  const timers = new Map();
  let nextTimerId = 1;
  const localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, value); },
  };
  const win = {
    console,
    localStorage,
    addEventListener() {}, removeEventListener() {},
    // A deferred timer queue. Firing a timer synchronously inside setTimeout()
    // would break the debounce: `persist()` does `persistTimer = setTimeout(…)`,
    // so an immediate callback resets the field to null and the assignment
    // then latches it shut, silently skipping every later write.
    setTimeout: (fn) => { timers.set(nextTimerId, fn); nextTimerId += 1; return nextTimerId - 1; },
    clearTimeout: (id) => { timers.delete(id); },
    __flush: () => {
      const pending = [...timers.values()];
      timers.clear();
      for (const fn of pending) fn();
    },
    confirm: () => false,
    __ModuleLoader__: { load(def) { data.set('module', def.factory((name) => (name === 'react' ? React : require(name)))); } },
  };
  const doc = {
    documentElement: { lang: 'zh-CN' },
    getElementById: () => null,
    head: { appendChild: () => {} },
    createElement: () => ({ textContent: '', id: '' }),
  };
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', code)(win, doc);
  return { data, storage, React, flush: win.__flush };
}

// ------------------------------------------------------------- event window
let seq = 0;
let clock = Date.parse('2026-11-01T00:00:00Z');
function event(type, payload) {
  seq += 1;
  clock += 1000;
  return { type: 'event', event: { type, seq, time: clock, data: payload || {} } };
}
function turn(question, reasoning, answer) {
  const turnNo = ++clock;
  return [
    event('turn/start', { turn: turnNo }),
    event('step/start', { turn: turnNo, step: 1 }),
    event('user/message', { content: [{ type: 'text', text: question }], source: { kind: 'user' } }),
    event('assistant/message', {
      turn: turnNo, step: 1,
      message: { role: 'assistant', content: [{ type: 'reasoning', text: reasoning }, { type: 'text', text: answer }] },
    }),
    event('step/end', { turn: turnNo, step: 1 }),
    event('turn/end', { turn: turnNo, reason: 'completed' }),
  ];
}
const windowEntries = [].concat(turn('第一问', '第一问的思考内容', '第一答'), turn('第二问', '第二问的思考内容', '第二答'));

function mount(host, entries) {
  const localeService = {
    register: () => () => {},
    bind: () => (key, params) => {
      const table = {
        'card.thinkMeta': '{count} chars',
        'card.thinkTruncated': '(only the newest {count} chars)',
        'card.think': 'Thinking',
      };
      let template = table[key] !== undefined ? table[key] : key;
      if (params) template = template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
      return template;
    },
    subscribe: () => () => {},
  };
  const binding = {
    eventSource: { getSnapshot: () => ({ entries, hasMore: false }), subscribe: () => () => {} },
    session: { getSnapshot: () => ({ running: false, openState: 'open' }), loadOlder: async () => {} },
  };
  let captured = null;
  const ctx = {
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
  };
  host.data.get('module').apply(ctx);
  return captured.options.inject().api;
}

const first = makeHost();
const firstApi = mount(first, windowEntries);
const firstStore = firstApi.storeFor('real');
firstApi.ensureProjection('real', firstStore);
const firstSnapshot = firstStore.getSnapshot();
if (firstSnapshot.nodes.length !== 2) throw new Error('expected 2 nodes, got ' + firstSnapshot.nodes.length);
if (!firstSnapshot.nodes[0].reasoning) throw new Error('reasoning was not projected');
firstStore.upsert({ id: 'child-1', parentId: firstSnapshot.nodes[0].id, sessionId: 'fork', question: '追问', answer: '', status: 'done', kind: 'branch', createdAt: 5 });

// The snapshot write is debounced; flush the queue so it lands.
first.flush();

// The persist timer is debounced 400ms; the test stub fires timers immediately,
// so the snapshot is already written. Read it back.
let raw = null;
for (const [key, value] of first.storage) {
  if (key.indexOf('dsh.treeConversations') === 0) raw = value;
}
if (!raw) throw new Error('no snapshot was written');
if (raw.indexOf('第一问的思考内容') >= 0) {
  throw new Error('the reasoning leaked into the localStorage snapshot');
}
const parsed = JSON.parse(raw);
const branch = parsed.nodes.find((node) => node.id === 'child-1');
if (!branch) throw new Error('the branch parent link was not persisted');
if (!branch.parentId) throw new Error('the branch lost its parentId in the snapshot');

// ------------------------------------------------- re-open in a fresh host
const second = makeHost();
// Carry the snapshot across, exactly as a page reload would.
for (const [key, value] of first.storage) second.storage.set(key, value);
const secondApi = mount(second, windowEntries);
const secondStore = secondApi.storeFor('real');
secondApi.ensureProjection('real', secondStore);
const second1 = secondStore.getSnapshot().nodes;
if (second1.length < 2) throw new Error('nodes disappeared after reload: ' + second1.length);
const restored = second1.find((node) => node.question === '第一问');
if (!restored || !restored.reasoning) {
  throw new Error('reasoning did not come back from the log after reload');
}
if (restored.reasoning.indexOf('第一问的思考内容') < 0) {
  throw new Error('unexpected reasoning after reload: ' + JSON.stringify(restored.reasoning));
}
const restoredBranch = second1.find((node) => node.id === 'child-1');
if (!restoredBranch || !restoredBranch.parentId) {
  throw new Error('the branch parent link did not survive the reload');
}

console.log(`PERSISTENCE OK — snapshot ${(raw.length / 1024).toFixed(1)}KB, no reasoning text, ${second1.length} nodes restored, reasoning re-derived from the log`);
