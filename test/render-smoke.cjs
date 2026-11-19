/*
 * Render smoke test: loads the client module, registers the view, renders the
 * whole tree with a fake React, and asserts the visible copy. Runs in plain
 * Node — no browser, no bundler.
 */
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
  documentElement: { lang: 'zh-CN' },
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

// A minimal locale service: same contract as the shell's (register / bind /
// subscribe), so the test exercises the same code path the app uses.
const localeState = {
  active: 'zh',
  dicts: new Map(),
  listeners: new Set(),
};

const localeService = {
  register(ns, dicts) {
    localeState.dicts.set(ns, dicts);
    for (const listener of [...localeState.listeners]) listener();
    return () => localeState.dicts.delete(ns);
  },
  bind(ns) {
    return (key, params) => {
      const dicts = localeState.dicts.get(ns) || {};
      // The host resolves the active language, then falls back to English. The
      // mock has to do the same or a language other than zh/en silently renders
      // English and the test proves nothing about the dictionaries.
      const chain = localeState.active === 'en' ? ['en'] : [localeState.active, 'en'];
      let template = key;
      for (const locale of chain) {
        const value = dicts[locale] && dicts[locale][key];
        if (value !== undefined) { template = value; break; }
      }
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
    };
  },
  subscribe(fn) {
    localeState.listeners.add(fn);
    return () => localeState.listeners.delete(fn);
  },
  setActive(lang) {
    localeState.active = lang;
    for (const listener of [...localeState.listeners]) listener();
  },
};

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
  locale: localeService,
  effect: (fn) => { const disposer = fn(); return disposer; },
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
// The depth-3 branch is `done` on purpose: a finished node still folds by
// default, so this pass locks the fold rule. The rule that the path to an
// *active* node never folds is covered by canvas-visibility.cjs.
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
  // A short answer with no children: the card must still offer the reader.
  answer: '短句', status: 'done', answerSeq: 4, kind: 'branch', createdAt: Date.parse('2026-11-12T02:00:00Z'),
});
nodeStore.select('b-mm9k21-a1b2');

const seen = [];
const buttons = [];
const pressedButtons = [];
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
  if (typeof type === 'string') {
    if (type === 'button') buttons.push(props);
    if (type === 'button' && Object.hasOwn(props, 'aria-pressed')) pressedButtons.push(props);
    children.forEach(walk);
    return;
  }
  if (typeof type !== 'function') return;
  if (type.prototype instanceof React.Component) {
    walk(new type(props).render());
    return;
  }
  walk(type(props));
}

function renderText(sessionId = 'session-1') {
  seen.length = 0;
  buttons.length = 0;
  pressedButtons.length = 0;
  walk(captured.component({ sessionId, api }));
  return seen.join(' ');
}

const buttonsTitled = (...titles) => buttons.filter((props) => titles.indexOf(props.title) >= 0);

// Pass 1 (zh): the folded tree. The deepest node is hidden by the default-fold
// rule, so this also proves the badge follows the actual newest creation time.
const zhText = renderText();
const zhExpect = ['无限探索', '4 个节点', '定位最新', '适应画布', '正在调用 read', '第 3 步', '全屏阅读', '分支记录：在工作区'];
for (const needle of zhExpect) {
  if (zhText.indexOf(needle) < 0) throw new Error('missing zh UI text: ' + needle);
}
if (zhText.indexOf('展开回答') >= 0) throw new Error('the in-card expand control must be gone');
if (zhText.indexOf('更深的分支') >= 0) throw new Error('depth-3 node should start folded');

// Pass 2 (zh): reveal is what 定位最新 uses; the badge must land on the newest node.
nodeStore.reveal('b-mm9k99-c3d4');
const revealed = renderText();
const mark = revealed.lastIndexOf('最新', revealed.indexOf('定位最新') - 1);
if (mark < 0) throw new Error('latest badge did not render after reveal');
const nearby = revealed.slice(mark, mark + 80);
if (nearby.indexOf('更深的分支') < 0) throw new Error('latest badge is not on the newest node: ' + nearby);
// Four answered cards are on screen now; the deepest one has a short answer
// and no children, so it only shows the footer when the entry point does not
// depend on answer length or child count.
const fullscreenButtons = buttonsTitled('全屏阅读完整回答');
if (fullscreenButtons.length !== 4) {
  throw new Error('every answered card must offer the reader, got ' + fullscreenButtons.length);
}

// Pass 3 (en): switching the shell language must switch the plugin's copy.
localeService.setActive('en');
const enText = renderText();
const enExpect = ['Infinite Exploration', '4 nodes', 'Jump to latest', 'Fit canvas', 'Calling read', 'step 3', 'Read full screen', 'Branch rows: in workspace'];
if (enText.indexOf('Expand answer') >= 0) throw new Error('the in-card expand control must be gone in en too');
for (const needle of enExpect) {
  if (enText.indexOf(needle) < 0) throw new Error('missing en UI text: ' + needle);
}
if (enText.indexOf('无限探索') >= 0) throw new Error('zh copy leaked into the en render');
if (enText.indexOf('第 3 步') >= 0) throw new Error('zh step label leaked into the en render');

// The tab label is a thunk, so it must follow the language too.
localeService.setActive('zh');
if (captured.options.label() !== '无限探索') throw new Error('zh tab label: ' + captured.options.label());
localeService.setActive('en');
if (captured.options.label() !== 'Infinite Exploration') throw new Error('en tab label: ' + captured.options.label());

// The six non-English host languages are registered too. Rendering one of them
// end to end proves the table is wired into the service rather than sitting in
// the bundle unused — and that the shell's fallback chain is intact.
for (const [lang, expected] of [
  ['de', 'Endlose Erkundung'],
  ['ja', '無限探索'],
  ['ru', 'Бесконечное исследование'],
]) {
  localeService.setActive(lang);
  const text = renderText();
  if (text.indexOf(expected) < 0) throw new Error(`missing ${lang} UI text: ${expected}`);
  if (captured.options.label().indexOf(expected) < 0) {
    throw new Error(`${lang} tab label: ${captured.options.label()}`);
  }
  // A fallback must never be the English key name.
  if (text.indexOf('view.') >= 0) throw new Error(`${lang} render leaked a raw key`);
}
localeService.setActive('en');

// The layout control is a two-way segmented group: both directions are on
// screen at once and the active one is a pressed state, so the reader never has
// to infer the current direction from the shape of the canvas. The card-size
// group is the same pattern: three presets, one pressed.
renderText();
let layoutButtons = buttonsTitled('Top to bottom', 'Left to right');
if (layoutButtons.length !== 2) throw new Error('expected two layout segments, got ' + layoutButtons.length);
if (layoutButtons[0]['aria-pressed'] !== true) throw new Error('the default layout must grow down');
if (layoutButtons[1]['aria-pressed'] !== false) throw new Error('the horizontal option must start unpressed');
if (layoutButtons[0]['aria-pressed'] === layoutButtons[1]['aria-pressed']) {
  throw new Error('exactly one layout segment may be pressed');
}
let cardSizeButtons = buttonsTitled('Compact', 'Standard', 'Roomy');
if (cardSizeButtons.length !== 3) throw new Error('expected three card-size presets, got ' + cardSizeButtons.length);
if (cardSizeButtons[1]['aria-pressed'] !== true) throw new Error('the standard card size must be the default');
if (cardSizeButtons[0]['aria-pressed'] !== false || cardSizeButtons[2]['aria-pressed'] !== false) {
  throw new Error('only one card-size preset may be pressed');
}
layoutButtons[1].onClick();
renderText('another-session');
layoutButtons = buttonsTitled('Top to bottom', 'Left to right');
if (layoutButtons[1]['aria-pressed'] !== true) throw new Error('the horizontal preference must survive another session');
if (layoutButtons[0]['aria-pressed'] !== false) throw new Error('only one layout segment may be pressed after switching');
layoutButtons[0].onClick();
renderText();
layoutButtons = buttonsTitled('Top to bottom', 'Left to right');
if (layoutButtons[0]['aria-pressed'] !== true) throw new Error('the layout must switch back to vertical');
// Clicking the segment that is already active must not flip the tree.
layoutButtons[0].onClick();
renderText();
layoutButtons = buttonsTitled('Top to bottom', 'Left to right');
if (layoutButtons[0]['aria-pressed'] !== true) throw new Error('re-pressing the active segment must keep the layout');
// The card-size choice is remembered the same way, and survives a re-render.
cardSizeButtons = buttonsTitled('Compact', 'Standard', 'Roomy');
cardSizeButtons[2].onClick();
renderText();
cardSizeButtons = buttonsTitled('Compact', 'Standard', 'Roomy');
if (cardSizeButtons[2]['aria-pressed'] !== true) throw new Error('the roomy preset must become active');
if (storage.get('dsh-explore:card-size') !== 'roomy') throw new Error('the card size must be persisted');
storage.set('dsh-explore:layout-direction', 'unexpected');
storage.set('dsh-explore:card-size', 'gigantic');
renderText();
layoutButtons = buttonsTitled('Top to bottom', 'Left to right');
cardSizeButtons = buttonsTitled('Compact', 'Standard', 'Roomy');
if (layoutButtons[0]['aria-pressed'] !== true) throw new Error('an invalid preference must use the default layout');
if (cardSizeButtons[1]['aria-pressed'] !== true) throw new Error('an invalid card size must use the standard preset');
const storageApi = window.localStorage;
window.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
renderText();
layoutButtons = buttonsTitled('Top to bottom', 'Left to right');
cardSizeButtons = buttonsTitled('Compact', 'Standard', 'Roomy');
if (layoutButtons[0]['aria-pressed'] !== true) throw new Error('blocked storage must use the default layout');
if (cardSizeButtons[1]['aria-pressed'] !== true) throw new Error('blocked storage must use the standard card size');

layoutButtons[1].onClick();
window.localStorage = storageApi;

console.log('zh chars:', zhText.length, '| en chars:', enText.length);
console.log('RENDER OK');
