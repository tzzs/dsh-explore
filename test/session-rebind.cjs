/*
 * Session re-bind test.
 *
 * Reported bug: leave a conversation while the「无限探索」tab is selected, come
 * back, and the canvas is empty — but visiting Chat first and then the tab
 * brings the nodes back.
 *
 * Why: a retained scope is retired when its reference count hits zero, and the
 * next retain/materialize mints a NEW Session instance with a NEW
 * `eventSource` (see dsh-api-session-controller ClientSessions.materializeScope:
 * `binding = { sessionId, session, eventSource: session.eventSource }` and the
 * Session constructor's `eventSource = new MutableSessionEventSource()`).
 *
 * The plugin used to
 *   1. keep the old unsubscribe, so the new window never reached it, and
 *   2. prune the store on the empty window it saw first.
 * Either one leaves the canvas blank until something else (Chat) fills the
 * window before the tab mounts.
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
  localStorage: { getItem: (key) => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => storage.set(key, value) },
  addEventListener() {}, removeEventListener() {},
  setTimeout: (fn) => { fn(); return 0; }, clearTimeout() {}, confirm: () => false,
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
function turn(question, answer) {
  const turnNo = ++clock;
  return [
    event('turn/start', { turn: turnNo }),
    event('step/start', { turn: turnNo, step: 1 }),
    event('user/message', { content: [{ type: 'text', text: question }], source: { kind: 'user' } }),
    event('assistant/message', { message: { role: 'assistant', content: [{ type: 'text', text: answer }] } }),
    event('step/end', { turn: turnNo, step: 1 }),
    event('turn/end', { turn: turnNo, reason: 'completed' }),
  ];
}
const fullWindow = [].concat(turn('第一问', '第一答'), turn('第二问', '第二答'), turn('第三问', '第三答'));

function sourceOf(entries) {
  const state = { entries, hasMore: false };
  const listeners = new Set();
  return {
    getSnapshot: () => ({ entries: state.entries, hasMore: state.hasMore }),
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    publish(nextEntries) {
      state.entries = nextEntries;
      for (const listener of [...listeners]) listener();
    },
    get subscriberCount() { return listeners.size; },
  };
}

const rootId = 'session-rebind';
const scope = {
  source: sourceOf([]),
  running: false,
  openState: 'cold',
  opened: 0,
  async open() {
    this.opened += 1;
    this.openState = 'open';
    this.source.publish(fullWindow);
    return true;
  },
  loadOlder: async () => {},
};
function bindingOf() {
  return {
    eventSource: scope.source,
    session: {
      getSnapshot: () => ({ running: scope.running, openState: scope.openState }),
      open: () => scope.open(),
      loadOlder: scope.loadOlder,
    },
  };
}

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
    binding: (id) => (id === rootId ? bindingOf() : undefined),
    retain: () => ({ ready: Promise.resolve(bindingOf()) }),
    fork: async () => { throw new Error('fork is not used by this test'); },
  },
  workspaces: {},
  locale: localeService,
  effect: (fn) => fn(),
};
global.__module.apply(ctx);
const api = captured.options.inject().api;
const store = api.storeFor(rootId);
const flush = () => new Promise((resolve) => setImmediate(resolve));

let checks = 0;
function ok() { checks += 1; }
function nodeCount() { return store.getSnapshot().nodes.length; }
function questions() { return store.getSnapshot().nodes.map((node) => node.question); }
function expect(condition, message) { if (!condition) throw new Error(message); }

(async function run() {
  // 1. First mount: the session is cold, the window is empty, open() fills it.
  api.ensureProjection(rootId, store);
  await flush();
  expect(scope.opened === 1, 'a cold window must ask the session to open');
  expect(nodeCount() === 3, 'expected 3 projected turns after open, got ' + nodeCount());
  ok();

  // 2. Leave and come back: the scope is retired and re-materialized, so the new
  // binding has a *new* event source and an empty window.
  scope.source = sourceOf([]);
  scope.openState = 'loading';
  api.ensureProjection(rootId, store);
  expect(nodeCount() === 3, 'a re-bound session with an empty window must not wipe the tree, got ' + nodeCount());
  ok();

  // 3. The new source publishes its page: the plugin must be listening to it.
  expect(scope.source.subscriberCount >= 1, 'the plugin must subscribe to the new event source');
  scope.source.publish(fullWindow);
  expect(nodeCount() === 3, 'the published window must project again, got ' + nodeCount());
  expect(questions().join(',') === '第一问,第二问,第三问', 'unexpected questions: ' + questions().join(','));
  ok();

  // 4. A second re-bind must not leak subscribers on the dropped source.
  const firstSource = scope.source;
  scope.source = sourceOf([]);
  scope.openState = 'cold';
  api.ensureProjection(rootId, store);
  await flush();
  expect(firstSource.subscriberCount === 0, 'the dropped event source must be unsubscribed');
  expect(scope.source.subscriberCount === 1, 'exactly one subscriber on the live source');
  expect(nodeCount() === 3, 'the tree survives a second re-bind, got ' + nodeCount());
  ok();

  // 5. A genuinely empty session still renders empty (no stale nodes leak in).
  const emptyId = 'session-empty';
  const emptyStore = api.storeFor(emptyId);
  api.ensureProjection(emptyId, emptyStore);
  expect(emptyStore.getSnapshot().nodes.length === 0, 'an empty session must project zero nodes');
  ok();

  console.log(`SESSION REBIND OK — ${checks} checks, ${nodeCount()} nodes kept across re-binds`);
})().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
