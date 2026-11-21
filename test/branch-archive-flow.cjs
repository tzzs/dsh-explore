/*
 * Branch archive flow, end to end through the real runtime.
 *
 * The source-level checks in branch-sessions.cjs prove the policy is written
 * down; this one drives it with fake DSH sessions/workspaces services:
 *
 *   - a finished branch is archived only after its turn ended, only while the
 *     policy is quiet, and never twice;
 *   - a branch parked on a question is not archived (an archived session
 *     refuses prompts);
 *   - switching the tree to listed restores exactly what the policy put away;
 *   - a deletion tombstone does not hand a quieted session to the restore
 *     path, and restoring the tombstone in listed mode does bring that
 *     session back;
 *   - forking from a quieted parent unarchives it first and re-quiets it only
 *     while the policy still owns it.
 *
 * Runs in plain Node: a fake React, fake services and no DOM.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const code = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');

let checks = 0;
function ok(condition, label) {
  assert.ok(condition, label);
  checks += 1;
}

const React = {
  createElement: (type, props, ...kids) => ({ type, props: { ...(props || {}), children: kids } }),
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

const archivedCalls = [];
const unarchivedCalls = [];
let entries = [];
let subscribers = new Set();
let forkCount = 0;

const binding = {
  eventSource: {
    getSnapshot: () => ({ entries, hasMore: false }),
    subscribe: (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  },
  session: {
    rename: async () => {},
    prompt: async () => ({ ok: true }),
    cancel: () => {},
    getSnapshot: () => ({ running: true, openState: 'open' }),
  },
};

const windowStub = {
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
      global.__module = def.factory((name) => (name === 'react' ? React : require(name)));
    },
  },
};
global.window = windowStub;
global.document = documentStub;

const ctx = {
  slots: {
    inject: (slot, cb) => cb(),
    register: (options) => {
      ctx.__view = options;
      return () => {};
    },
  },
  sessions: {
    fork: async () => 'child-' + (++forkCount),
    retain: () => ({ ready: Promise.resolve(binding), release() {} }),
    binding: () => binding,
  },
  workspaces: {
    archiveSession: (sessionId, options) => {
      archivedCalls.push({ sessionId, options });
    },
    unarchiveSession: (sessionId) => {
      unarchivedCalls.push(sessionId);
    },
  },
  effect: (fn) => { fn(); },
};

// eslint-disable-next-line no-new-func
new Function('window', 'document', code)(windowStub, documentStub);
assert.ok(global.__module && typeof global.__module.apply === 'function', 'the plugin must load');

// The locale service is absent on purpose: the built-in table must carry the
// runtime's copy, and nothing here may depend on the shell.
global.__module.apply(ctx);
const api = ctx.__view.inject().api;
const rootId = 'root-1';
const store = api.storeFor(rootId);
store.upsert({
  id: 'root-1', parentId: null, sessionId: rootId, question: 'q', answer: 'a',
  status: 'done', answerSeq: 5, kind: 'root', createdAt: 1000,
});

// Each branch's own turn has to come after the prefix it inherited, exactly as
// the host's seqs do; a reused seq would sit below the child's baseline and be
// skipped by readBranch().
let seqBase = 0;
function nextSeq() {
  seqBase += 10;
  return seqBase;
}

function finishedTurn() {
  const start = nextSeq();
  return [
    { type: 'event', event: { type: 'turn/start', seq: start, time: 1000 }, seq: start },
    {
      type: 'event',
      event: {
        type: 'assistant/message', seq: start + 1,
        data: { message: { content: [{ type: 'text', text: 'the answer' }] } },
      },
      seq: start + 1,
    },
    { type: 'event', event: { type: 'turn/end', seq: start + 2, time: 1500 }, seq: start + 2 },
  ];
}

function notify() {
  for (const listener of [...subscribers]) listener();
}

async function startBranch(question) {
  const nodes = store.getSnapshot().nodes;
  const parent = store.getNode(nodes[nodes.length - 1].id);
  await api.branch(rootId, parent, question);
  const node = store.getSnapshot().nodes.filter((item) => item.kind === 'branch').pop();
  assert.ok(node, 'a branch node must exist after branch()');
  return node;
}

function archived(sessionId) {
  return archivedCalls.filter((call) => call.sessionId === sessionId);
}

(async () => {
  // 1. Listed policy: a finished branch stays in the workspace.
  const first = await startBranch('first branch');
  entries = finishedTurn();
  notify();
  ok(archivedCalls.length === 0, 'a finished branch is not archived while the policy is listed');
  ok(first.status === 'done', 'the branch card settles as done');

  // 2. Switching to quiet migrates the branch that already exists.
  api.setBranchListing(rootId, 'quiet');
  ok(store.getSnapshot().branchMode === 'quiet', 'the store remembers the effective policy');
  ok(archived('child-1').length === 1, 'the listed finished branch is archived by the switch');
  ok(store.getSnapshot().quieted.indexOf('child-1') >= 0, 'the migrated session is tracked as quieted');

  // 3. New branch: nothing before the turn ends, exactly one archive after.
  await startBranch('second branch');
  ok(archived('child-2').length === 0, 'the new branch is not archived while it is still running');
  entries = finishedTurn();
  notify();
  ok(archived('child-2').length === 1, 'the finished branch is archived exactly once');
  ok(archived('child-2')[0].options && archived('child-2')[0].options.stopActivity === true,
    'the archive call stops activity only after the turn ended');
  ok(store.getSnapshot().quieted.indexOf('child-2') >= 0, 'the quieted session is recorded in the store');
  notify();
  ok(archived('child-2').length === 1, 'a repeated read does not archive the same session twice');

  // 4. A branch parked on a question is never archived: an archived session
  //    would refuse the reply it is waiting for.
  const waiting = await startBranch('waiting branch');
  const start = nextSeq();
  entries = [
    { type: 'event', event: { type: 'turn/start', seq: start, time: 1000 }, seq: start },
    {
      type: 'event',
      event: { type: 'tool/call', seq: start + 1, data: { name: 'ask_user_question', callId: 'q-1' } },
      seq: start + 1,
    },
  ];
  notify();
  ok(waiting.awaiting === 'question', 'the waiting card knows it is blocked on the user');
  ok(archived('child-3').length === 0, 'a branch waiting on the user is not archived');
  ok(store.getSnapshot().quieted.indexOf('child-3') < 0, 'the waiting session is not tracked as quieted');
  api.setBranchListing(rootId, 'quiet');
  ok(store.getSnapshot().quieted.indexOf('child-3') < 0, 'the switch skips a waiting branch');

  // 5. Switching back restores what the policy put away, and nothing else.
  unarchivedCalls.length = 0;
  api.setBranchListing(rootId, 'listed');
  ok(unarchivedCalls.indexOf('child-1') >= 0 && unarchivedCalls.indexOf('child-2') >= 0,
    'switching back restores every quieted branch');
  ok(unarchivedCalls.indexOf('child-3') < 0, 'a session that was never quieted is left alone');
  ok(store.getSnapshot().quieted.length === 0, 'the quieted list is empty after restoring');

  // 6. A quieted branch that gets deleted is not handed to the restore path.
  api.setBranchListing(rootId, 'quiet');
  const branchNodes = store.getSnapshot().nodes.filter((item) => item.kind === 'branch');
  const quietedNode = branchNodes.find((item) => item.sessionId === 'child-2');
  ok(quietedNode, 'the quieted branch node exists');
  api.deleteSubtree(rootId, quietedNode.id);
  ok(store.getSnapshot().archived.indexOf('child-2') < 0,
    'deletion does not record an already quieted session for restore');
  unarchivedCalls.length = 0;
  api.restoreHidden(rootId);
  ok(unarchivedCalls.indexOf('child-2') < 0,
    'restoring in quiet mode does not surface a session the policy quieted');
  ok(store.getSnapshot().quieted.indexOf('child-2') >= 0,
    'the quieted record survives the delete/restore cycle in quiet mode');

  // 7. With the tree back on "listed", restoring the tombstone does bring the
  //    quieted session back — otherwise it would stay archived, untracked.
  api.deleteSubtree(rootId, quietedNode.id);
  api.setBranchListing(rootId, 'listed');
  ok(unarchivedCalls.indexOf('child-2') < 0,
    'a tombstoned quieted session is not restored by the switch');
  ok(store.getSnapshot().quieted.indexOf('child-2') >= 0,
    'the switch keeps the id it could not restore');
  api.restoreHidden(rootId);
  ok(unarchivedCalls.indexOf('child-2') >= 0,
    'restoring the node in listed mode unarchives its quieted session');
  ok(store.getSnapshot().quieted.indexOf('child-2') < 0,
    'the restored session leaves the quieted list');

  // 8. Forking from a quieted parent unarchives it for the fork and re-quiets
  //    it only while the policy still owns it.
  api.setBranchListing(rootId, 'quiet');
  unarchivedCalls.length = 0;
  const quietedParent = store.getSnapshot().nodes.find((item) => item.sessionId === 'child-1');
  await api.branch(rootId, quietedParent, 'fork from a quieted branch');
  ok(unarchivedCalls.indexOf('child-1') >= 0, 'the quieted parent is unarchived for the fork');
  ok(archived('child-1').length >= 2, 'the parent is quieted again after the fork');

  console.log(`BRANCH ARCHIVE FLOW OK — ${checks} checks: turn-end archiving, waiting guard, migration, tombstone isolation, fork safety`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
