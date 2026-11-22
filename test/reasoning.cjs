/*
 * Reasoning display test.
 *
 * The gap this locks down: a card said "正在思考…" and a seconds counter, and
 * nothing else. A reader could see that the agent was busy but not what it was
 * doing. The model writes its thinking down as `reasoning` content blocks —
 * live as a `reasoning-delta` chunk, settled as a `{ type: 'reasoning', text }`
 * block inside the durable `assistant/message` — and the view now surfaces it.
 *
 * Asserted:
 *   1. the live tail of a running branch shows the model's current thought;
 *   2. a settled turn's reasoning is projected onto its node, the card keeps
 *      only an entry point, and the reader shows the chain (unfolded when the
 *      card's entry opened it);
 *   3. a turn whose model never reasoned shows no reasoning section at all;
 *   4. the settled block wins over the streamed draft of the same step, so the
 *      text is not doubled;
 *   5. zh and en stay key-for-key.
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
/** A live chunk, as the client session controller materializes it. */
function liveChunk(chunk, turn, step) {
  seq += 1;
  clock += 10;
  return {
    type: 'transient',
    event: {
      type: 'assistant/live-chunk',
      seq,
      time: clock,
      data: { attemptId: 'attempt-1', turn, step, chunk },
    },
  };
}
function reasoningMessage(turn, step, reasoning, text) {
  const content = [];
  if (reasoning) content.push({ type: 'reasoning', text: reasoning });
  if (text) content.push({ type: 'text', text });
  return event('assistant/message', {
    turn, step,
    message: { id: 'm-' + turn + '-' + step, role: 'assistant', content },
    usage: { totalTokens: 100 },
  });
}

/** One question/answer turn. `steps` lists the reasoning of each step. */
function turn(question, answer, options) {
  const opts = options || {};
  const turnNo = opts.turn || ++clock;
  const entries = [
    event('turn/start', { turn: turnNo }),
    event('step/start', { turn: turnNo, step: 1 }),
    event('user/message', { content: [{ type: 'text', text: question }], source: { kind: 'user' } }),
  ];
  for (const step of opts.steps || []) {
    entries.push(reasoningMessage(turnNo, step.step, step.reasoning, step.text));
    entries.push(event('step/end', { turn: turnNo, step: step.step }));
  }
  if (opts.answer) {
    entries.push(reasoningMessage(turnNo, (opts.steps || []).length + 1, opts.reasoning, opts.answer));
  }
  entries.push(event('turn/end', { turn: turnNo, reason: 'completed' }));
  return entries;
}

const settledWindow = []
  .concat(turn('第一个问题', '第一个回答', {
    steps: [{ step: 1, reasoning: '先看用户到底想要什么，再决定用哪个工具。' }],
    answer: '第一个回答',
  }))
  .concat(turn('第二个问题', null, {
    turn: 2,
    steps: [{ step: 1, reasoning: '这一轮模型没有写思考。' }],
  }));

// A model that never thinks: no reasoning block at all.
const silentWindow = [].concat(turn('不想问题', '直接回答', { turn: 4 }));

const bindings = new Map([
  ['session-settled', { entries: settledWindow, running: false }],
  ['session-silent', { entries: silentWindow, running: false }],
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

// 1. A settled turn projects its reasoning onto the card ----------------------
const settledStore = project('session-settled');
const settledNodes = settledStore.getSnapshot().nodes;
if (settledNodes.length !== 2) throw new Error('expected 2 projected turns, got ' + settledNodes.length);
if (!settledNodes[0].reasoning) throw new Error('the settled reasoning did not reach the node');
if (settledNodes[0].reasoning.indexOf('先看用户到底想要什么') < 0) {
  throw new Error('unexpected reasoning on the node: ' + JSON.stringify(settledNodes[0].reasoning));
}
ok();

const settledText = render('session-settled');
expect(settledText, '思考过程', 'reasoning strip on the card');
expectNot(settledText, '先看用户到底想要什么', 'reasoning body on the card (the card is a preview only)');
// One entry, two bodies: the reader opens on the answer, and the chain is one
// deliberate switch away. This is the proof that the enlarge entry is unified —
// there is no second way in that lands on the thinking instead.
settledStore.openReader(settledNodes[0].id);
const answerPaneText = render('session-settled');
expectNot(answerPaneText, '先看用户到底想要什么', 'the reader opens on the answer');
settledStore.setReaderPane('reasoning');
const settledReaderText = render('session-settled');
expect(settledReaderText, '先看用户到底想要什么', 'reasoning body after switching to its pane');
settledStore.setReaderPane('result');
expectNot(render('session-settled'), '先看用户到底想要什么', 'switching back shows the answer');
settledStore.closeReader();
ok();

// 2. A branch's reasoning is read from its fork session ----------------------
// Branch nodes do not go through ensureChain: their text comes from
// `readBranch`, which subscribes to the fork session's own event window. This
// exercises that path rather than hand-setting the node, so removing the
// reasoning reads in readBranch would fail here.
const forkWindow = [
  event('session/end-seed', { inherited: true }),
  event('turn/start', { turn: 1 }),
  event('step/start', { turn: 1, step: 1 }),
  liveChunk({ type: 'reasoning-delta', index: 0, text: '分支自己' }, 1, 1),
  liveChunk({ type: 'reasoning-delta', index: 0, text: '的思考整段' }, 1, 1),
  liveChunk({ type: 'text-delta', index: 1, text: '分支的回答' }, 1, 1),
];
bindings.set('session-fork', {
  eventSource: { getSnapshot: () => ({ entries: forkWindow, hasMore: false }), subscribe: () => () => {} },
  session: { getSnapshot: () => ({ running: true }), loadOlder: async () => {} },
});
// The tree root still needs its own (empty) binding: ensureProjection returns
// early without one, and it is what walks the branch nodes.
bindings.set('session-parent', {
  eventSource: { getSnapshot: () => ({ entries: [], hasMore: false }), subscribe: () => () => {} },
  session: { getSnapshot: () => ({ running: false }), loadOlder: async () => {} },
});
const branchStore = api.storeFor('session-parent');
branchStore.upsert({
  id: 'b-test-1', parentId: null, sessionId: 'session-fork', question: '跑到一半',
  answer: '', status: 'streaming', answerSeq: 0, kind: 'branch',
  createdAt: Date.now(), baseSeq: forkWindow[0].event.seq, startedAt: Date.now() - 3000,
});
// ensureOpen is what wires a tree's branch nodes to their fork sessions;
// ensureProjection alone only projects the root's own turns.
Promise.resolve(api.ensureOpen('session-parent', branchStore));
const branchNode = branchStore.getNode('b-test-1');
if (!branchNode.reasoning) {
  throw new Error('readBranch did not project the fork session reasoning');
}
if (branchNode.reasoning.indexOf('分支自己的思考整段') < 0) {
  throw new Error('unexpected branch reasoning: ' + JSON.stringify(branchNode.reasoning));
}
const branchText = render('session-parent');
expect(branchText, '分支自己的思考整段', 'live reasoning tail from the fork session');
ok();

// 3. A model that never thinks shows no reasoning section ---------------------
const silentStore = project('session-silent');
const silentNode = silentStore.getSnapshot().nodes[0];
if (silentNode.reasoning) throw new Error('a silent model must not produce reasoning');
const silentText = render('session-silent');
expectNot(silentText, '思考过程', 'reasoning section on a silent turn');
ok();

// 4. The settled block wins over the streamed draft of the same step ---------
// The host streams the thinking and then settles it; the settled text must
// replace the draft, not be appended to it.
const draftWindow = [].concat(
  event('turn/start', { turn: 9 }),
  event('step/start', { turn: 9, step: 1 }),
  event('user/message', { content: [{ type: 'text', text: '草稿问题' }], source: { kind: 'user' } }),
  liveChunk({ type: 'reasoning-delta', index: 0, text: '草稿思考' }, 9, 1),
  reasoningMessage(9, 1, '草稿思考（已定稿）', '草稿回答'),
  event('step/end', { turn: 9, step: 1 }),
  event('turn/end', { turn: 9, reason: 'completed' }),
);
bindings.set('session-draft', {
  eventSource: { getSnapshot: () => ({ entries: draftWindow, hasMore: false }), subscribe: () => () => {} },
  session: { getSnapshot: () => ({ running: false }), loadOlder: async () => {} },
});
const draftStore = project('session-draft');
const draftNode = draftStore.getSnapshot().nodes[0];
if (draftNode.reasoning.indexOf('草稿思考（已定稿）') < 0) {
  throw new Error('the settled reasoning did not land: ' + JSON.stringify(draftNode.reasoning));
}
if (draftNode.reasoning.split('草稿思考').length > 2) {
  throw new Error('the streamed draft was not replaced by the settled block: ' + JSON.stringify(draftNode.reasoning));
}
ok();

// 5. The live tail renders while the branch runs ------------------------------
const liveStore = api.storeFor('session-live');
liveStore.upsert({
  id: 'b-live-1', parentId: null, sessionId: 'session-live', question: '正在想',
  answer: '', status: 'streaming', answerSeq: 0, kind: 'branch',
  createdAt: Date.now(), step: 1, startedAt: Date.now() - 2000,
  reasoning: '模型正在权衡两条路线，先看哪一条的代价更低。',
});
const liveText = render('session-live');
expect(liveText, '模型正在权衡两条路线', 'live reasoning tail');
ok();

// 6. A long turn is capped, and the cap keeps the newest thinking ----------
// An agent turn can think for hundreds of kilobytes. The card keeps only the
// tail, and says so, so the reader knows the text is not the whole story.
const hugeWindow = [].concat(
  event('turn/start', { turn: 11 }),
  event('step/start', { turn: 11, step: 1 }),
  event('user/message', { content: [{ type: 'text', text: '长问题' }], source: { kind: 'user' } }),
  reasoningMessage(11, 1, '开头标记。' + '甲'.repeat(40000) + '。最新的一步在这里。', '长回答'),
  event('step/end', { turn: 11, step: 1 }),
  event('turn/end', { turn: 11, reason: 'completed' }),
);
bindings.set('session-huge', {
  eventSource: { getSnapshot: () => ({ entries: hugeWindow, hasMore: false }), subscribe: () => () => {} },
  session: { getSnapshot: () => ({ running: false }), loadOlder: async () => {} },
});
const hugeStore = project('session-huge');
const hugeNode = hugeStore.getSnapshot().nodes[0];
if (hugeNode.reasoning.length > 12100) {
  throw new Error('the reasoning was not capped: ' + hugeNode.reasoning.length);
}
// The dropped count is metadata, not text glued onto the reasoning: the
// reader's disclosure has to be able to admit the text is partial.
if (!hugeNode.reasoningDropped) {
  throw new Error('the truncation was not recorded as metadata');
}
if (hugeNode.reasoningDropped !== 40000 + '开头标记。'.length + '。最新的一步在这里。'.length - hugeNode.reasoning.length) {
  throw new Error('the dropped count is wrong: ' + hugeNode.reasoningDropped);
}
if (hugeNode.reasoning.indexOf('只保留了最新') >= 0) {
  throw new Error('the notice leaked into the reasoning text: ' + hugeNode.reasoning.slice(0, 80));
}
if (hugeNode.reasoning.indexOf('最新的一步在这里') < 0) {
  throw new Error('the cap dropped the newest thinking: ' + hugeNode.reasoning.slice(-120));
}
ok();

// 7. A retried step starts from a clean slate ---------------------------------
// The host reuses the same turn/step when it retries, so the failed attempt's
// thinking must not survive into the retry.
//
// The fixture deliberately does NOT settle the retry with an `assistant/message`
// for the step: that would replace the step's blocks wholesale and hide a
// broken reset. The failed attempt's streamed text is what must be gone.
const retryWindow = [].concat(
  event('turn/start', { turn: 12 }),
  event('step/start', { turn: 12, step: 1 }),
  event('user/message', { content: [{ type: 'text', text: '重试问题' }], source: { kind: 'user' } }),
  liveChunk({ type: 'reasoning-delta', index: 0, text: '失败那次的思考' }, 12, 1),
  event('llm/retry', { turn: 12, step: 1, retry: 1, mode: 'normal', delayMs: 100 }),
  event('llm/retry-started', { turn: 12, step: 1, retry: 1 }),
  liveChunk({ type: 'reasoning-delta', index: 0, text: '成功那次的思考' }, 12, 1),
  event('step/end', { turn: 12, step: 1 }),
  event('turn/end', { turn: 12, reason: 'completed' }),
);
bindings.set('session-retry', {
  eventSource: { getSnapshot: () => ({ entries: retryWindow, hasMore: false }), subscribe: () => () => {} },
  session: { getSnapshot: () => ({ running: false }), loadOlder: async () => {} },
});
const retryStore = project('session-retry');
const retryNode = retryStore.getSnapshot().nodes[0];
if (retryNode.reasoning.indexOf('失败那次的思考') >= 0) {
  throw new Error('the failed attempt leaked into the reasoning: ' + JSON.stringify(retryNode.reasoning));
}
if (retryNode.reasoning.indexOf('成功那次的思考') < 0) {
  throw new Error('the retry lost the reasoning: ' + JSON.stringify(retryNode.reasoning));
}
ok();

// 7b. A reset of step 1 must not wipe step 11 --------------------------------
// The key of a step is `turn:step#`, so the prefix of step 1 is not a prefix
// of step 11. Getting this wrong would silently delete a later step's
// thinking whenever an earlier step is retried.
const prefixWindow = [].concat(
  event('turn/start', { turn: 14 }),
  event('step/start', { turn: 14, step: 1 }),
  event('user/message', { content: [{ type: 'text', text: '多步问题' }], source: { kind: 'user' } }),
  liveChunk({ type: 'reasoning-delta', index: 0, text: '第一步的思考' }, 14, 1),
  event('step/end', { turn: 14, step: 1 }),
  event('step/start', { turn: 14, step: 11 }),
  liveChunk({ type: 'reasoning-delta', index: 0, text: '第十一步的思考' }, 14, 11),
  event('llm/retry', { turn: 14, step: 1, retry: 1, mode: 'normal', delayMs: 100 }),
  event('step/end', { turn: 14, step: 11 }),
  event('turn/end', { turn: 14, reason: 'completed' }),
);
bindings.set('session-prefix', {
  eventSource: { getSnapshot: () => ({ entries: prefixWindow, hasMore: false }), subscribe: () => () => {} },
  session: { getSnapshot: () => ({ running: false }), loadOlder: async () => {} },
});
const prefixStore = project('session-prefix');
const prefixNode = prefixStore.getSnapshot().nodes[0];
if (prefixNode.reasoning.indexOf('第十一步的思考') < 0) {
  throw new Error('resetting step 1 wiped step 11: ' + JSON.stringify(prefixNode.reasoning));
}
ok();

// 8. Two reasoning blocks in one step are both kept --------------------------
const twoBlockWindow = [].concat(
  event('turn/start', { turn: 13 }),
  event('step/start', { turn: 13, step: 1 }),
  event('user/message', { content: [{ type: 'text', text: '两块问题' }], source: { kind: 'user' } }),
  event('assistant/message', {
    turn: 13, step: 1,
    message: {
      role: 'assistant',
      content: [
        { type: 'reasoning', text: '第一块思考' },
        { type: 'reasoning', text: '第二块思考' },
      ],
    },
  }),
  event('step/end', { turn: 13, step: 1 }),
  event('turn/end', { turn: 13, reason: 'completed' }),
);
bindings.set('session-two-blocks', {
  eventSource: { getSnapshot: () => ({ entries: twoBlockWindow, hasMore: false }), subscribe: () => () => {} },
  session: { getSnapshot: () => ({ running: false }), loadOlder: async () => {} },
});
const twoBlockStore = project('session-two-blocks');
const twoBlockNode = twoBlockStore.getSnapshot().nodes[0];
if (twoBlockNode.reasoning.indexOf('第一块思考') < 0 || twoBlockNode.reasoning.indexOf('第二块思考') < 0) {
  throw new Error('a reasoning block was lost: ' + JSON.stringify(twoBlockNode.reasoning));
}
ok();

// 8b. The dropped-chars report must be truthful ------------------------------
// A block is trimmed more than once in normal use: while it streams, then
// again when its settled block replaces the streamed draft. A running counter
// would report the same characters twice, and would keep claiming a loss
// after a long draft was replaced by a short settled block.
function longTurn(turnNo, stepNo, streamedChunks, settledText) {
  const entries = [
    event('turn/start', { turn: turnNo }),
    event('step/start', { turn: turnNo, step: stepNo }),
    event('user/message', { content: [{ type: 'text', text: '长问题' }], source: { kind: 'user' } }),
  ];
  for (let i = 0; i < streamedChunks; i += 1) {
    entries.push(liveChunk({ type: 'reasoning-delta', index: 0, text: '甲'.repeat(1000) }, turnNo, stepNo));
  }
  entries.push(reasoningMessage(turnNo, stepNo, settledText, '答'));
  entries.push(event('turn/end', { turn: turnNo, reason: 'completed' }));
  return entries;
}
const announced = (node) => node.reasoningDropped || 0;

// 30k streamed, then settled with the same 30k: exactly 18k was dropped.
bindings.set('session-cap-a', {
  eventSource: { getSnapshot: () => ({ entries: longTurn(21, 1, 30, '甲'.repeat(30000)) }), hasMore: false, subscribe: () => () => {} },
  session: { getSnapshot: () => ({ running: false }), loadOlder: async () => {} },
});
const capA = project('session-cap-a').getSnapshot().nodes[0];
if (announced(capA) !== 18000) {
  throw new Error('dropped count is wrong for a re-trimmed block: ' + announced(capA));
}

// 30k streamed, then settled with 8 chars: nothing is lost, so nothing may be claimed.
bindings.set('session-cap-b', {
  eventSource: { getSnapshot: () => ({ entries: longTurn(22, 1, 30, '短短的一点点') }), hasMore: false, subscribe: () => () => {} },
  session: { getSnapshot: () => ({ running: false }), loadOlder: async () => {} },
});
const capB = project('session-cap-b').getSnapshot().nodes[0];
if (announced(capB) !== 0) {
  throw new Error('a short settled block inherited a false truncation claim: ' + announced(capB)
    + ' / ' + JSON.stringify(capB.reasoning.slice(0, 60)));
}
if ((capB.reasoning || '').indexOf('短短的一点点') < 0) {
  throw new Error('the short settled block was lost: ' + JSON.stringify(capB.reasoning));
}
ok();

// 8c. The count is right *while the block is still streaming* ----------------
// The live tally must add up the bytes that arrived, not the kept length: the
// trim cuts each fragment straight back off, so a "max kept" reading would
// report one chunk's loss for a turn that dropped tens of kilobytes. The card
// shows the notice on running nodes too, so this is visible mid-think.
const liveTurn = [
  event('turn/start', { turn: 23 }),
  event('step/start', { turn: 23, step: 1 }),
  event('user/message', { content: [{ type: 'text', text: '流式长问题' }], source: { kind: 'user' } }),
];
for (let i = 0; i < 300; i += 1) {
  liveTurn.push(liveChunk({ type: 'reasoning-delta', index: 0, text: '甲'.repeat(100) }, 23, 1));
}
// Deliberately no assistant/message: the block is still streaming.
bindings.set('session-cap-live', {
  eventSource: { getSnapshot: () => ({ entries: liveTurn, hasMore: false }), subscribe: () => () => {} },
  session: { getSnapshot: () => ({ running: true }), loadOlder: async () => {} },
});
const capLive = project('session-cap-live').getSnapshot().nodes[0];
if (capLive.reasoning.length > 12100) {
  throw new Error('the live reasoning was not capped: ' + capLive.reasoning.length);
}
if (announced(capLive) !== 30000 - capLive.reasoning.length) {
  throw new Error('the live dropped count is wrong: announced ' + announced(capLive)
    + ', truth ' + (30000 - capLive.reasoning.length));
}
ok();

// 9. zh and en must stay key-for-key -----------------------------------------
const dicts = localeState.dicts.get('dsh-explore') || {};
const zhKeys = Object.keys(dicts.zh || {}).sort();
const enKeys = Object.keys(dicts.en || {}).sort();
if (zhKeys.length !== enKeys.length || zhKeys.some((key, index) => key !== enKeys[index])) {
  const onlyZh = zhKeys.filter((key) => enKeys.indexOf(key) < 0);
  const onlyEn = enKeys.filter((key) => zhKeys.indexOf(key) < 0);
  throw new Error('locale keys diverged — zh only: ' + onlyZh.join(',') + ' | en only: ' + onlyEn.join(','));
}
ok();

console.log(`REASONING OK — ${checks} checks, ${settledNodes.length} projected turns, ${zhKeys.length} locale keys`);
