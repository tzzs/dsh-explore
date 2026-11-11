/* Throwaway smoke test: module evaluation + registration only, then delete. */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'client.js');
const code = fs.readFileSync(file, 'utf8');

const calls = [];
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
  getElementById: () => null,
  head: { appendChild: (node) => calls.push(['style', node.textContent.length]) },
  createElement: () => ({ textContent: '', id: '' }),
};

global.window = {
  console,
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, value),
  },
  addEventListener() {}, removeEventListener() {},
  setTimeout: (fn) => { fn(); return 1; },
  clearTimeout() {},
  confirm: () => false,
  __ModuleLoader__: {
    load(def) {
      const built = def.factory((name) => (name === 'react' ? React : require(name)));
      global.__module = built;
      calls.push(['loaded', def.id]);
    },
  },
};
global.document = documentStub;

// eslint-disable-next-line no-new-func
new Function('window', 'document', code)(global.window, documentStub);

const plugin = global.__module;
if (!plugin || typeof plugin.apply !== 'function') throw new Error('module did not export apply');

const ctx = {
  slots: {
    inject: (slot, cb) => { calls.push(['inject', slot]); cb(); },
    register: (options, component) => {
      calls.push(['register', options.id, options.order, options.label()]);
      calls.push(['component', typeof component]);
      const injected = options.inject();
      calls.push(['api', Object.keys(injected.api).sort().join(',')]);
      return () => {};
    },
  },
  sessions: {},
};

plugin.apply(ctx);

const registered = calls.find((entry) => entry[0] === 'register');
if (!registered) throw new Error('conversation.view was not registered');

// ---------------------------------------------------------------- render pass
let captured = null;
ctx.slots.register = (options, component) => {
  captured = { options, component };
  return () => {};
};
ctx.slots.inject = (slot, cb) => cb();
plugin.apply(ctx);
if (!captured) throw new Error('component was not captured');

const api = captured.options.inject().api;
const rootId = api.rootOf('session-1');
const nodeStore = api.storeFor(rootId);

// A chain with a branch, a running node, a long answer and a selected node.
nodeStore.upsert({
  id: 'root-1', parentId: null, sessionId: rootId, question: '第一个问题', answer: '简短回答',
  status: 'done', answerSeq: 3, kind: 'root', createdAt: 1000, startedAt: 900,
  cost: { ms: 1200, tokens: 340, cached: 0, running: false },
});
nodeStore.upsert({
  id: 'root-7', parentId: 'root-1', sessionId: rootId, question: '第二个问题',
  answer: 'x'.repeat(400), status: 'done', answerSeq: 9, kind: 'root',
  createdAt: 2000, startedAt: 1900,
});
nodeStore.upsert({
  id: 'b-mm9k21-a1b2', parentId: 'root-7', sessionId: 'child-1', question: '分支追问',
  answer: '分支里的一小段', status: 'streaming', answerSeq: 4, kind: 'branch',
  createdAt: Date.parse('2026-11-12T01:00:00Z'), step: 3, tool: 'read',
  startedAt: Date.now() - 4000,
});
nodeStore.upsert({
  id: 'b-mm9k99-c3d4', parentId: 'b-mm9k21-a1b2', sessionId: 'child-2', question: '更深的分支',
  answer: '', status: 'thinking', answerSeq: 0, kind: 'branch', createdAt: Date.parse('2026-11-12T02:00:00Z'),
});
nodeStore.select('b-mm9k21-a1b2');

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
  if (type.prototype instanceof React.Component) {
    walk(new type(props).render());
    return;
  }
  walk(type(props));
}

function renderText() {
  seen.length = 0;
  walk(captured.component({ sessionId: 'session-1', api }));
  return seen.join(' ');
}

// Pass 1: the folded tree. The deepest node is hidden by the default-fold rule,
// so this also proves the badge follows the actual newest creation time.
const text = renderText();
const expect = ['无限探索', '4 个节点', '定位最新', '适应画布', '正在调用 read', '第 3 步', '展开回答', '全屏阅读'];
for (const needle of expect) {
  if (text.indexOf(needle) < 0) throw new Error('missing UI text: ' + needle);
}
if (text.indexOf('更深的分支') >= 0) throw new Error('depth-3 node should start folded');

// Pass 2: reveal is what 定位最新 uses; the badge must land on the newest node.
nodeStore.reveal('b-mm9k99-c3d4');
const revealed = renderText();
const mark = revealed.lastIndexOf('最新', revealed.indexOf('定位最新') - 1);
if (mark < 0) throw new Error('latest badge did not render after reveal');
const nearby = revealed.slice(mark, mark + 80);
if (nearby.indexOf('更深的分支') < 0) throw new Error('latest badge is not on the newest node: ' + nearby);

console.log('rendered chars:', revealed.length);
console.log('RENDER OK');
