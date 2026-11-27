/*
 * Prompt attachments on a card.
 *
 * A prompt's content is an array of blocks, and text is only one kind: an
 * attached image is a `{ type: 'image', attachment }` block beside the text.
 * `textOf` reads text blocks only, so the image was dropped at projection and
 * the card rendered a prompt with no picture and no hint that one existed.
 *
 * Asserted:
 *   1. the projection keeps each attachment ref in content order, and an
 *      image-only prompt still becomes a card;
 *   2. the snapshot keeps those refs, so a reload does not lose the thumbnails;
 *   3. a card renders one <img> per attachment through the host's cached URL,
 *      and a text-only prompt renders none;
 *   4. the runtime resolves an attachment through the host's reader, and
 *      rejects rather than throws on a host that has no reader at all.
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
// The image block sits first and the text second, exactly as the host writes a
// prompt that carries both.
const ATTACHMENT = {
  attachmentId: 'sha256:b60b7a2afaaec94457006f382200a37087e3cf08956cdd1cf5d0a4eb68039b1a',
  mediaType: 'image/png',
  width: 892,
  height: 754,
  bytes: 85687,
  name: 'image.png',
};
const SECOND_ATTACHMENT = {
  attachmentId: 'sha256:0f4c1d8e5b6a49728c3d1f0a9b7e6d5c4b3a2918f7e6d5c4b3a2918071605f4e',
  mediaType: 'image/png',
  width: 640,
  height: 480,
  bytes: 20480,
  name: 'image.png',
};

let seq = 0;
let clock = Date.parse('2026-11-27T13:20:00Z');
function event(type, data) {
  seq += 1;
  clock += 1000;
  return { type: 'event', event: { type, seq, time: clock, data: data || {} } };
}
function userMessage(content) {
  return event('user/message', { source: { kind: 'user' }, content });
}
function assistantMessage(turn, text) {
  return event('assistant/message', {
    turn, step: 1,
    message: { id: 'm-' + turn, role: 'assistant', content: [{ type: 'text', text }] },
  });
}
/** One turn's events; `answer` may be absent for a turn that never settled. */
function turn(turnNo, content, answer) {
  const entries = [
    event('turn/start', { turn: turnNo }),
    event('step/start', { turn: turnNo, step: 1 }),
    userMessage(content),
  ];
  if (answer) entries.push(assistantMessage(turnNo, answer));
  entries.push(event('turn/end', { turn: turnNo, reason: 'completed' }));
  return entries;
}

const entries = [].concat(
  turn(1, [
    { type: 'image', attachment: ATTACHMENT },
    { type: 'text', text: '/poteto-mode  在无限探索的页面上，好像不会展示我附带的图片信息。' },
  ], '第一轮的回答'),
  // No answer: only the image may keep this turn on the canvas.
  turn(2, [{ type: 'image', attachment: SECOND_ATTACHMENT }]),
  turn(3, [{ type: 'text', text: '这一轮只有文字' }], '第三轮的回答'),
);

const bindings = new Map([['session-images', {
  eventSource: { getSnapshot: () => ({ entries, hasMore: false }), subscribe: () => () => {} },
  session: { getSnapshot: () => ({ running: false }), loadOlder: async () => {} },
}]]);

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

// The host's authorized image reader. Only a cached URL is served here: the
// test renders synchronously, so the peek path is what a card has on first paint.
const PEEK_URL = 'blob:card-thumbnail';
const RESOLVED_URL = 'blob:resolved-thumbnail';
const peeked = [];
const requested = [];
let uiConversation = {
  peekImageUrl(sessionId, attachment) {
    peeked.push([sessionId, attachment.attachmentId]);
    return PEEK_URL;
  },
  imageUrl(sessionId, attachment) {
    requested.push([sessionId, attachment.attachmentId]);
    return Promise.resolve(RESOLVED_URL);
  },
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
  get: (name) => (name === 'uiConversation' ? uiConversation : undefined),
};
global.__module.apply(ctx);
if (!captured) throw new Error('conversation.view was not registered');
const api = captured.options.inject().api;

// ---------------------------------------------------------------- helpers
const seen = [];
const images = [];
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
    if (type === 'img') images.push(props);
    children.forEach(walk);
    return;
  }
  if (typeof type !== 'function') return;
  if (type.prototype instanceof React.Component) { walk(new type(props).render()); return; }
  walk(type(props));
}

let checks = 0;
function ok() { checks += 1; }
function same(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  ok();
}

// 1. The projection keeps the attachment refs --------------------------------
const store = api.storeFor('session-images');
api.ensureProjection('session-images', store);
const nodes = store.getSnapshot().nodes;
const first = nodes[0];
if (!first) throw new Error('no card projected from the turn that carries an image');
same(Array.isArray(first.images), true, 'the first card keeps an images list');
same(first.images.length, 1, 'the first card keeps its one attachment');
for (const field of ['attachmentId', 'mediaType', 'width', 'height', 'bytes', 'name']) {
  same(first.images[0][field], ATTACHMENT[field], 'attachment ' + field);
}
if (first.question.indexOf('不会展示我附带的图片信息') < 0) {
  throw new Error('the text block beside the image was lost: ' + JSON.stringify(first.question));
}
ok();

if (nodes.length !== 3) throw new Error('expected 3 projected turns, got ' + nodes.length);
ok();

const second = nodes[1];
same(second.images.length, 1, 'an image-only prompt keeps its attachment');
same(second.images[0].attachmentId, SECOND_ATTACHMENT.attachmentId, 'the second attachment id');
same(second.question, '', 'an image-only prompt has no question text');
same(second.answer, '', 'the image-only turn never answered');

const third = nodes[2];
same(third.images.length, 0, 'a text-only prompt carries no images');
if (third.question !== '这一轮只有文字') throw new Error('unexpected third question: ' + JSON.stringify(third.question));
ok();

// 2. The snapshot keeps the refs ---------------------------------------------
const persisted = [...storage.values()].filter((raw) => raw.indexOf(ATTACHMENT.attachmentId) >= 0);
same(persisted.length, 1, 'the attachment ref is persisted with the tree');
ok();

// 3. A card renders one <img> per attachment --------------------------------
seen.length = 0;
images.length = 0;
walk(captured.component({ sessionId: 'session-images', api }));
same(images.length, 2, 'one thumbnail per image-bearing card, none for the text-only turn');
for (const img of images) {
  same(img.src, PEEK_URL, 'the thumbnail uses the URL the host already cached');
  same(img.alt, 'image.png', 'the thumbnail is labelled with the file name');
  same(img.title, 'image.png', 'the thumbnail tooltip is the file name');
  same(img.loading, 'lazy', 'the thumbnail does not block the first paint');
}
same(peeked.length, 2, 'the card asks the host for a cached URL, and only for real attachments');
same(peeked[0][0], 'session-images', 'the cache lookup carries the node session');
const cardText = seen.join(' ');
if (cardText.indexOf('（无问题）') >= 0) throw new Error('an image-only prompt must not print the no-question placeholder');
ok();
const cardImages = images.length;

// The reader is the close-up: it draws the same attachment again, larger.
store.openReader(first.id);
images.length = 0;
walk(captured.component({ sessionId: 'session-images', api }));
same(images.length, cardImages + 1, 'the reader adds its own copy of the open card image');
store.closeReader();
ok();

// 4. The runtime resolves an attachment, and survives a host without one -----
(async () => {
  const resolved = await api.loadImage('session-images', ATTACHMENT);
  same(resolved, RESOLVED_URL, 'loadImage resolves through the host reader');
  same(requested.length, 1, 'exactly one host read per call');
  same(requested[0][1], ATTACHMENT.attachmentId, 'the read carries the attachment id');

  uiConversation = null;
  same(api.peekImage('session-images', ATTACHMENT), undefined, 'peekImage invents no URL without the service');

  let pending;
  try {
    pending = api.loadImage('session-images', ATTACHMENT);
  } catch (error) {
    throw new Error('loadImage threw instead of rejecting: ' + error.message);
  }
  if (!pending || typeof pending.then !== 'function') throw new Error('loadImage must return a promise');
  ok();
  let settled = null;
  let rejected = null;
  await pending.then((value) => { settled = value; }, (error) => { rejected = error; });
  if (settled !== null) throw new Error('loadImage resolved without an image service');
  if (!(rejected instanceof Error)) throw new Error('loadImage must reject when the image service is absent');
  ok();

  console.log(`CARD ATTACHMENTS OK — ${checks} checks: attachment refs projected and persisted, ${cardImages} card thumbnails plus the reader's copy, image-only prompt keeps its card, no reader rejects safely`);
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
