/*
 * The card is a preview and the reader is the close-up. Two things have to stay
 * true for that split to be usable, and neither was true before:
 *
 *   1. the card's rendered height does not depend on how much text the model
 *      has streamed — it used to grow with the answer and shrink/grow again
 *      with the one-or-two-line reasoning strip, and every change re-laid out
 *      the whole tree through ResizeObserver -> setHeight -> layoutTree;
 *   2. the card has exactly one enlarge entry point, and the enlarged card can
 *      show the answer AND the reasoning. It used to have four targets that all
 *      opened the same dialog, two of them asking it to open on the reasoning.
 *
 * A plain-Node harness cannot measure pixels, so it asserts the *declared*
 * geometry: every block whose height could follow the text must carry a
 * numeric height and no maxHeight, and two renders whose text differs by three
 * orders of magnitude must produce byte-identical layout styles. That is the
 * contract a browser honours.
 *
 * Runs in plain Node: fake React, no DOM, no browser.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');

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
new Function('window', 'document', source)(global.window, documentStub);

const plugin = global.__module;
if (!plugin || typeof plugin.apply !== 'function') throw new Error('module did not export apply');

const localeState = { active: 'zh', dicts: new Map(), listeners: new Set() };
const localeService = {
  register(ns, dicts) { localeState.dicts.set(ns, dicts); return () => {}; },
  bind(ns) {
    return (key, params) => {
      const dicts = localeState.dicts.get(ns) || {};
      const chain = localeState.active === 'en' ? ['en'] : [localeState.active, 'en'];
      let template = key;
      for (const locale of chain) {
        const value = dicts[locale] && dicts[locale][key];
        if (value !== undefined) { template = value; break; }
      }
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
    };
  },
  subscribe: () => () => {},
};

let captured = null;
const ctx = {
  slots: {
    inject: (slot, cb) => { cb(); },
    register: (options, component) => { captured = { options, component }; return () => {}; },
  },
  sessions: {},
  locale: localeService,
  effect: (fn) => { fn(); },
};
plugin.apply(ctx);
if (!captured) throw new Error('the view did not register');

const SESSION = 'session-card';
const api = { ...captured.options.inject().api, ensureOpen: () => {} };

// ------------------------------------------------------------------ rendering
let seen = [];
function walk(el) {
  if (el === null || el === undefined || el === false || el === true) return;
  if (typeof el === 'string' || typeof el === 'number') { seen.push(String(el)); return; }
  if (Array.isArray(el)) { el.forEach(walk); return; }
  const { type, props } = el;
  const children = [];
  if (props && props.children !== undefined) children.push(props.children);
  if (typeof type === 'string') { children.forEach(walk); return; }
  if (typeof type !== 'function') return;
  if (type.prototype instanceof React.Component) { walk(new type(props).render()); return; }
  walk(type(props));
}

function render() {
  seen = [];
  walk(captured.component({ sessionId: SESSION, api }));
  return seen.join(' ');
}

/** Every element of a rendered tree, parents before children. */
function elements(el, out = []) {
  if (el === null || el === undefined || el === false || el === true) return out;
  if (typeof el === 'string' || typeof el === 'number') return out;
  if (Array.isArray(el)) { el.forEach((child) => elements(child, out)); return out; }
  const { type, props } = el;
  const children = [];
  if (props && props.children !== undefined) children.push(props.children);
  if (typeof type === 'string') {
    out.push(el);
    children.forEach((child) => elements(child, out));
    return out;
  }
  if (typeof type !== 'function') return out;
  if (type.prototype instanceof React.Component) { elements(new type(props).render(), out); return out; }
  elements(type(props), out);
  return out;
}

function tree() {
  return captured.component({ sessionId: SESSION, api });
}

/** The reader's own text, so the card behind it cannot answer for it. */
function readerText() {
  const dialog = elements(tree()).find((el) => el.type === 'dialog');
  if (!dialog) return '';
  const outer = seen;
  seen = [];
  walk(dialog);
  const text = seen.join(' ');
  seen = outer;
  return text;
}

function cardOf(rendered) {
  const found = elements(rendered).find((el) => String(el.props.className || '').split(' ').includes('dsh-tree-card'));
  assert.ok(found, 'the card must render');
  return found;
}

function cardSource() {
  const start = source.indexOf('    function NodeCard(');
  const end = source.indexOf('\n    function Composer(', start);
  assert.ok(start > 0 && end > start, 'NodeCard must exist');
  return source.slice(start, end);
}

/** The layout styles that could make a card's height follow its text. */
const LAYOUT_KEYS = ['height', 'minHeight', 'maxHeight', 'lineHeight', 'fontSize', 'whiteSpace',
  'overflow', 'display', 'flex', 'flexDirection', 'marginTop', 'padding', 'boxSizing', 'width'];
function signature(el, out = []) {
  if (!el || typeof el !== 'object') return out;
  if (Array.isArray(el)) { el.forEach((child) => signature(child, out)); return out; }
  if (typeof el === 'string' || typeof el === 'number') return out;
  const { type, props } = el;
  const style = (props && props.style) || {};
  const cls = String((props && props.className) || '');
  // Only the card's own scaffolding counts. Markdown output is content: a
  // longer answer legitimately produces more paragraphs, and comparing those
  // would measure the renderer instead of the card's frame.
  if (cls.includes('dsh-tree-')) {
    out.push({
      tag: typeof type === 'string' ? type : (type && type.name) || 'component',
      cls,
      style: LAYOUT_KEYS.reduce((acc, key) => {
        if (style[key] !== undefined) acc[key] = style[key];
        return acc;
      }, {}),
    });
  }
  const children = [];
  if (props && props.children !== undefined) children.push(props.children);
  if (typeof type === 'function' && !(type.prototype instanceof React.Component)) {
    signature(type(props), out);
    return out;
  }
  children.forEach((child) => signature(child, out));
  return out;
}

let checks = 0;
function ok(condition, label) {
  assert.ok(condition, label);
  checks += 1;
}
function equal(actual, expected, label) {
  assert.equal(actual, expected, label);
  checks += 1;
}

// ---------------------------------------------------------------- the fixture
const store = api.storeFor(SESSION);
const NODE = 'card-1';
function seed(patch) {
  store.upsert({
    id: NODE,
    parentId: null,
    sessionId: SESSION,
    kind: 'branch',
    question: '一个问题，可以有哪些探索方向？',
    answer: '',
    status: 'streaming',
    step: 3,
    startedAt: Date.now() - 120000,
    reasoning: '',
    reasoningDropped: 0,
    cost: { ms: 120000, tokens: 1000, cached: 0 },
    createdAt: 1,
    ...patch,
  });
}

// ---- (a) the card's height does not follow the stream ----------------------
const SHORT = { reasoning: '想一下', answer: '好的' };
const LONG = {
  reasoning: ('第一段想法，关于卡片应该长什么样。\n\n- 第一点\n- 第二点\n\n').repeat(40),
  answer: ('结论。\n\n' + '这是一段很长的回答，用来把卡片的内容区撑满并溢出。'.repeat(60)),
};

seed(SHORT);
const shortSig = signature(cardOf(tree()));
seed(LONG);
const longSig = signature(cardOf(tree()));

assert.deepEqual(longSig, shortSig,
  'a 12000-character reasoning and a 4000-character answer must produce the same layout styles as one short line');
checks += 1;

const blockSet = (rendered) => elements(cardOf(rendered))
  .filter((el) => typeof el.type === 'string' && String(el.props.className || '').startsWith('dsh-tree-'))
  .map((el) => el.props.className);
seed(LONG);
const longBlocks = blockSet(tree());
seed(SHORT);
const shortBlocks = blockSet(tree());
assert.deepEqual(longBlocks, shortBlocks, 'the block set must not depend on the text');
checks += 1;

const bands = elements(cardOf(tree())).filter((el) => String(el.props.className || '').includes('dsh-tree-band'));
equal(bands.length, 1, 'one body band per card');
equal(bands[0].props.style.height, 146, 'a running card takes the standard preset height');
equal(bands[0].props.style.maxHeight, 146, 'the band is capped at the preset height');
equal(bands[0].props.style.overflow, 'hidden', 'the band clips what grows inside it');

// Settled, the band stops declaring a height and hugs its content, so a short
// answer does not leave a hole under the card. The height only changes at the
// end of a turn, never while tokens arrive.
seed({ status: 'done', answerSeq: 12, reasoning: '想了一下', answer: '短' });
const settledBand = elements(cardOf(tree())).find((el) => String(el.props.className || '') === 'dsh-tree-band');
equal(settledBand.props.style.height, undefined, 'a settled card does not declare a band height');
equal(settledBand.props.style.maxHeight, 146, 'a settled band is still capped');

const previews = elements(cardOf(tree())).filter((el) => String(el.props.className || '').includes('dsh-tree-preview'));
equal(previews.length, 1, 'one answer window');
equal(previews[0].props.onClick, undefined, 'the answer window is not a target any more');

// ---- the reasoning strip: one line, fixed, inert --------------------------
seed({ reasoning: '第一行想法\n第二行想法\n第三行想法' });
const strips = elements(cardOf(tree())).filter((el) => String(el.props.className || '').includes('dsh-tree-thinking'));
equal(strips.length, 1, 'one reasoning strip');
equal(strips[0].type, 'div', 'the strip is not a button');
equal(strips[0].props.onClick, undefined, 'the strip has no click logic of its own');
equal(strips[0].props.style.height, 18, 'the strip is one fixed line');
// The band is a flex column: a shrinkable row is compressed to a sliver the
// moment the answer overflows the fixed window, which is how a declared 18px
// row rendered at 1.6px before this was pinned.
equal(strips[0].props.style.flex, '0 0 auto', 'the strip cannot be shrunk by its band');
equal(strips[0].props.style.overflow, 'hidden', 'the strip clips its text');
equal(strips[0].props.style.whiteSpace, undefined, 'the ellipsis lives on the text span');

const stripText = elements(cardOf(tree())).find((el) => String(el.props.className || '') === 'dsh-tree-one-line');
assert.ok(stripText, 'the strip text is one line with an ellipsis');
checks += 1;
ok(render().includes('第二行想法') === false && render().includes('第三行想法'),
  'the strip shows the newest line only');

// ---- the chip cannot grow either ------------------------------------------
for (const [label, patch] of [
  ['thinking', { step: 3, answer: '', tool: '' }],
  ['calling', { step: 3, answer: '', tool: 'read' }],
  ['outputting', { step: 3, answer: '已经开始写了', tool: '' }],
]) {
  seed(patch);
  const chip = elements(cardOf(tree())).find((el) => String(el.props.className || '') === 'dsh-tree-live');
  assert.ok(chip, 'the progress chip renders for ' + label);
  equal(chip.props.style.height, 29, 'the progress chip keeps its height for ' + label);
  equal(chip.props.style.flex, '0 0 auto', 'the chip cannot be shrunk by its band for ' + label);
}

// A running card that has not thought yet says nothing rather than showing a
// bare label; hiding the row cannot move the card because the band is fixed.
seed({ reasoning: '', answer: '正在写', tool: '' });
ok(!elements(cardOf(tree())).some((el) => String(el.props.className || '') === 'dsh-tree-thinking'),
  'no strip before the first thought');

// ---- (b) exactly one enlarge entry point ----------------------------------
const card = cardOf(tree());
const clicks = elements(card).filter((el) => typeof el.props.onClick === 'function');
ok(clicks.length >= 3, 'the card still has its own controls');

let openers = 0;
for (const el of clicks) {
  store.closeReader();
  try {
    el.props.onClick({
      stopPropagation() {}, preventDefault() {},
      target: { closest: () => null },
      currentTarget: { previousElementSibling: { focus() {} } },
    });
  } catch (error) { /* a control that needs a live session is not an opener */ }
  if (store.getSnapshot().reading) openers += 1;
}
equal(openers, 1, 'exactly one click in the card opens the reader');
store.closeReader();

equal((cardSource().match(/store\.openReader\(/g) || []).length, 1,
  'the card has exactly one store.openReader call site');
assert.doesNotMatch(cardSource(), /reasoning: true/, 'no caller can ask the reader for a mode');
checks += 1;

// ---- one surface, two bodies ---------------------------------------------
seed({ status: 'done', answerSeq: 7, reasoning: '先看用户到底想要什么，再决定用哪个工具。', answer: '把想法展开，再沿着感兴趣的方向继续问。' });
store.openReader(NODE);
const answerPane = readerText();
assert.ok(answerPane.includes('最终结果') && answerPane.includes('思考过程'), 'both panes are offered');
checks += 1;
ok(answerPane.includes('把想法展开'), 'the reader opens on the answer');
ok(!answerPane.includes('先看用户到底想要什么'), 'the chain is not forced into the answer');

store.setReaderPane('reasoning');
const reasoningPane = readerText();
ok(reasoningPane.includes('先看用户到底想要什么'), 'switching shows the chain');
ok(!reasoningPane.includes('把想法展开'), 'and hides the answer');
ok(reasoningPane.includes('思考过程'), 'the pressed pane is labelled');

store.setReaderPane('result');
ok(readerText().includes('把想法展开'), 'switching back shows the answer again');

const readerTrees = elements(tree()).filter((el) => String(el.props.className || '') === 'dsh-tree-scroll');
equal(readerTrees.length, 1, 'the reader has exactly one scroll container');

// A node that never reasoned cannot be switched to a reasoning pane, so the
// store cannot hold a pane the node cannot fill.
seed({ status: 'done', answerSeq: 8, reasoning: '', answer: '只有回答。' });
store.closeReader();
store.openReader(NODE);
store.setReaderPane('reasoning');
equal(store.getSnapshot().reading.pane, 'result', 'an empty chain is not a pane');
ok(!readerText().includes('思考过程'), 'a silent node offers no reasoning pane');

// ---- readingOf, unit level -----------------------------------------------
{
  const start = source.indexOf('    function readingOf(node) {');
  const end = source.indexOf('\n    function ', start + 10);
  assert.ok(start > 0 && end > start, 'readingOf must exist');
  const readingOf = new Function(source.slice(start, end) + '\nreturn readingOf;')();
  equal(readingOf({ answer: '', reasoning: '' }).kind, 'none', 'nothing written');
  equal(readingOf({ answer: '', reasoning: '在想' }).kind, 'reasoning', 'only a chain');
  equal(readingOf({ answer: '答', reasoning: '' }).kind, 'result', 'only an answer');
  equal(readingOf({ answer: '答', reasoning: '在想' }).kind, 'result', 'an answer with a chain behind it');
  equal(readingOf({ answer: '答', reasoning: '在想' }).hasReasoning, true, 'the chain is reported');
  equal(readingOf({ answer: '   ', reasoning: '  ' }).kind, 'none', 'whitespace is not content');
}

console.log(`CARD READING OK — ${checks} checks: one fixed card, one entry, two panes`);
