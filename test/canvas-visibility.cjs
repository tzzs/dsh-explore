/*
 * Canvas visibility test.
 *
 * The bug this locks down: a branch that is still running (or parked on a
 * question / approval) had no layout position at all, because the mainline is
 * one parent/child chain and every node at depth >= 2 defaults to folded. The
 * card was in the store and the toolbar counted it as running, but nothing was
 * drawn — "the canvas does not show the node that is in progress".
 *
 * Two rules are asserted:
 *   1. the path to an active node is never folded by default, so its card is
 *      laid out and rendered (a deep *finished* node still folds);
 *   2. a pending ask_user_question / approval is labelled as waiting on the
 *      user, both on the card and as a toolbar chip.
 *
 * The projection half also covers the prompt-kind fix: the host only ever emits
 * `source.kind: 'user'` or `'user-question-reply'`, and the reply turn must not
 * be projected away.
 *
 * Runs in plain Node — fake React, no browser, no bundler.
 */
const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');

// --------------------------------------------------------------- host stubs
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
const documentStub = {
  documentElement: { lang: 'zh-CN' },
  getElementById: () => null,
  head: { appendChild: () => {} },
  createElement: () => ({ textContent: '', id: '' }),
};
global.window = {
  console,
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, value),
  },
  addEventListener() {}, removeEventListener() {},
  setTimeout: (fn) => { fn(); return 0; },
  clearTimeout() {},
  confirm: () => false,
  __ModuleLoader__: { load(def) { global.__module = def.factory((name) => (name === 'react' ? React : require(name))); } },
};
global.document = documentStub;
// eslint-disable-next-line no-new-func
new Function('window', 'document', code)(global.window, documentStub);

// ------------------------------------------------------------- event window
let seq = 0;
let clock = Date.parse('2026-11-01T00:00:00Z');
function event(type, data) {
  seq += 1;
  clock += 1000;
  return { type: 'event', event: { type, seq, time: clock, data: data || {} } };
}
function chunk(text) {
  seq += 1;
  clock += 10;
  return { type: 'transient', event: { type: 'assistant/live-chunk', seq, time: clock, data: { chunk: { type: 'text-delta', text } } } };
}

/** One question/answer turn, matching the host's durable append order. */
function turn(question, answer, options) {
  const opts = options || {};
  const turnNo = ++clock;
  const entries = [
    event('turn/start', { turn: turnNo }),
    event('step/start', { turn: turnNo, step: 1 }),
  ];
  if (opts.source) {
    entries.push(event('user/message', { content: [{ type: 'text', text: question }], source: opts.source }));
  } else {
    entries.push(event('user/message', { content: [{ type: 'text', text: question }], source: { kind: 'user' } }));
  }
  if (answer) {
    entries.push(event('assistant/message', {
      message: { role: 'assistant', content: [{ type: 'text', text: answer }] },
      usage: { totalTokens: 100 },
    }));
  }
  if (opts.tool) {
    entries.push(event('tool/call', { turn: turnNo, step: 1, callId: opts.callId || 'call_1', name: opts.tool }));
  }
  if (opts.approval) {
    entries.push(event('approval/asked', {
      id: opts.approval, toolName: opts.tool || 'pwsh', callId: opts.callId || 'call_1', reason: 'needs permission',
    }));
  }
  if (!opts.open) {
    entries.push(event('step/end', { turn: turnNo, step: 1 }));
    entries.push(event('turn/end', { turn: turnNo, reason: 'completed' }));
  }
  return entries;
}

const awaitingWindow = []
  .concat(turn('问题一', '回答一'), turn('问题二', '回答二'), turn('问题三', '回答三'),
    turn('问题四', '回答四'), turn('问题五', '回答五'))
  .concat(chunk('先想一想…'))
  .concat(turn('问题六', '已经说了一半', { open: true, tool: 'ask_user_question', callId: 'call_q1' }));

const approvalWindow = []
  .concat(turn('审批一', '回答一'))
  .concat(turn('审批二', '准备执行', { open: true, tool: 'pwsh', callId: 'call_a1', approval: 'approval_1' }));

const replyWindow = turn(
  '{"kind":"answer_to_pending_question","tool":"ask_user_question","questions":[{"id":"style","question":"要哪一种分支风格？"}],"answers":[{"id":"style","selected":["A"]}]}',
  '收到，按 A 来做',
  { source: { kind: 'user-question-reply', callId: 'call_q0', outcome: 'answered' } });

const foldedWindow = ['问题一', '问题二', '问题三', '问题四', '问题五']
  .map((question, index) => turn(question, '回答' + (index + 1)))
  .reduce((all, entries) => all.concat(entries), []);

const bindings = new Map([
  ['session-awaiting', { entries: awaitingWindow, running: true }],
  ['session-approval', { entries: approvalWindow, running: true }],
  ['session-reply', { entries: replyWindow, running: true }],
  ['session-folded', { entries: foldedWindow, running: false }],
].map(([id, fixture]) => [id, {
  eventSource: { getSnapshot: () => ({ entries: fixture.entries, hasMore: false }), subscribe: () => () => {} },
  session: { getSnapshot: () => ({ running: fixture.running }), loadOlder: async () => {} },
}]));

// ------------------------------------------------------------- plugin mount
const localeState = { dicts: new Map(), listeners: new Set(), active: 'zh' };
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
const ctx = {
  slots: {
    inject: (slot, cb) => cb(),
    register: (options, component) => { captured = { options, component }; return () => {}; },
  },
  sessions: {
    binding: (id) => bindings.get(id),
    retain: () => ({ ready: Promise.resolve(undefined) }),
    fork: async () => { throw new Error('fork is not used by this test'); },
  },
  workspaces: {},
  locale: localeService,
  effect: (fn) => fn(),
};
global.__module.apply(ctx);
if (!captured) throw new Error('conversation.view was not registered');
const api = captured.options.inject().api;

// ---------------------------------------------------------------- helpers
const seen = [];
function walk(el) {
  if (el === null || el === undefined || el === false) return;
  if (typeof el === 'string' || typeof el === 'number') {
    const text = String(el);
    if (text.trim()) seen.push(text);
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
function project(sessionId) {
  const store = api.storeFor(sessionId);
  api.ensureProjection(sessionId, store);
  return store;
}
function render(sessionId) {
  seen.length = 0;
  walk(captured.component({ sessionId, api }));
  return seen.join(' ');
}
function expect(text, needle, label) {
  if (text.indexOf(needle) < 0) throw new Error(`missing ${label}: ${needle}`);
}
function expectNot(text, needle, label) {
  if (text.indexOf(needle) >= 0) throw new Error(`${label} should not render: ${needle}`);
}

let checks = 0;
function ok() { checks += 1; }

// 1. A parked question keeps the open turn and names the wait -----------------
const awaitingStore = project('session-awaiting');
const awaitingNodes = awaitingStore.getSnapshot().nodes;
if (awaitingNodes.length !== 6) throw new Error('expected 6 projected turns, got ' + awaitingNodes.length);
const parked = awaitingNodes[awaitingNodes.length - 1];
if (parked.status !== 'running') throw new Error('parked turn must stay running, got ' + parked.status);
if (parked.awaiting !== 'question') throw new Error('parked turn must report awaiting=question, got ' + JSON.stringify(parked.awaiting));
ok();

const awaitingText = render('session-awaiting');
// The card is laid out and drawn although it sits 5 levels below a default fold.
expect(awaitingText, '问题六', 'parked question card');
expect(awaitingText, '等待回答', 'awaiting status badge');
expect(awaitingText, '等你回答…', 'awaiting progress row');
expect(awaitingText, '1 个在等你', 'awaiting toolbar chip');
expect(awaitingText, '1 条分支在跑', 'running toolbar chip');
ok();

// 2. The fold default still applies to a chain nobody is working on ----------
const foldedStore = project('session-folded');
if (foldedStore.getSnapshot().nodes.length !== 5) throw new Error('expected 5 folded turns');
const foldedText = render('session-folded');
expect(foldedText, '问题一', 'first turn');
expect(foldedText, '问题三', 'third turn');
expectNot(foldedText, '问题四', 'turn behind the default fold');
expectNot(foldedText, '问题五', 'newest turn behind the default fold');
ok();

// 3. A pending approval is a wait on the user, not just a tool call -----------
const approvalStore = project('session-approval');
const approvalNodes = approvalStore.getSnapshot().nodes;
const approving = approvalNodes[approvalNodes.length - 1];
if (approving.awaiting !== 'approval') throw new Error('expected awaiting=approval, got ' + JSON.stringify(approving.awaiting));
const approvalText = render('session-approval');
expect(approvalText, '等待授权', 'approval status badge');
expect(approvalText, '等你授权…', 'approval progress row');
ok();

// 4. A question reply is a real prompt, and its envelope is not the card text -
const replyStore = project('session-reply');
const replyNodes = replyStore.getSnapshot().nodes;
if (replyNodes.length !== 1) throw new Error('question-reply turn was dropped from the projection');
if (replyNodes[0].question !== '要哪一种分支风格？') {
  throw new Error('question reply should surface the asked question, got ' + JSON.stringify(replyNodes[0].question));
}
ok();

// 5. zh and en must stay key-for-key (a missing translation falls back to the
// key itself, which is how raw `card.status.awaiting` would leak into the UI).
const dicts = localeState.dicts.get('dsh-explore') || {};
const zhKeys = Object.keys(dicts.zh || {}).sort();
const enKeys = Object.keys(dicts.en || {}).sort();
if (zhKeys.length !== enKeys.length || zhKeys.some((key, index) => key !== enKeys[index])) {
  const onlyZh = zhKeys.filter((key) => enKeys.indexOf(key) < 0);
  const onlyEn = enKeys.filter((key) => zhKeys.indexOf(key) < 0);
  throw new Error('locale keys diverged — zh only: ' + onlyZh.join(',') + ' | en only: ' + onlyEn.join(','));
}
ok();

console.log(`CANVAS VISIBILITY OK — ${checks} checks, ${awaitingNodes.length + foldedStore.getSnapshot().nodes.length + approvalNodes.length + replyNodes.length} projected nodes, ${zhKeys.length} locale keys`);
