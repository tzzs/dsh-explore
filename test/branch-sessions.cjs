/*
 * Branch sessions and the workspace list.
 *
 * A branch is a real forked session, so DSH lists it as its own row — the
 * canvas cannot invent a "subtask" row (that nesting exists only for host
 * subagent sessions) and fork cannot set a parent. Archive is the one
 * supported visibility lever, and an archived session still keeps its history
 * readable through retain/binding, so this is the policy:
 *
 *   1. finshed branch sessions are archived, running/waiting ones are not
 *      (an archived session refuses prompts);
 *   2. the toolbar switches the whole tree between "in the workspace" and
 *      "archived", migrating the branches that already exist;
 *   3. "quieted" is tracked separately from the deletion tombstones, so
 *      restoring a deleted node cannot surface a branch the policy quieted;
 *   4. forking from a quieted branch briefly unarchives it, then quiets it
 *      again — the child is the session that runs.
 *
 * Runs in plain Node: no browser, no DOM, no dependencies.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');

let checks = 0;
function ok(condition, label) {
  assert.ok(condition, label);
  checks += 1;
}
function matches(label, pattern, text) {
  assert.match(text, pattern, label);
  checks += 1;
}
function doesNotMatch(label, pattern, text) {
  assert.doesNotMatch(text, pattern, label);
  checks += 1;
}

// --- preference helpers -----------------------------------------------------
const helperStart = source.indexOf('    const CARD_SIZE_KEY');
const helperEnd = source.indexOf('    // Font families follow Settings');
assert.ok(helperStart > 0 && helperEnd > helperStart, 'display preference helpers must exist');
const map = new Map();
const display = new Function('NODE_W', 'window',
  source.slice(helperStart, helperEnd)
  + '\nreturn { readBranchMode, saveBranchMode };')(320, {
  localStorage: {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  },
});
assert.equal(display.readBranchMode(), 'listed', 'branch rows are listed by default');
display.saveBranchMode('quiet');
assert.equal(display.readBranchMode(), 'quiet', 'the branch policy is remembered');
map.set('dsh-explore:branch-sessions', 'hidden');
assert.equal(display.readBranchMode(), 'listed', 'an invalid branch policy falls back to listed');
const blocked = new Function('NODE_W', 'window',
  source.slice(helperStart, helperEnd) + '\nreturn { readBranchMode, saveBranchMode };')(320, {
  localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } },
});
assert.equal(blocked.readBranchMode(), 'listed', 'blocked storage gives the default branch policy');
blocked.saveBranchMode('quiet');
ok(true, 'blocked storage must not throw when saving the branch policy');

// --- store: quieted is its own overlay --------------------------------------
matches('the store keeps a quieted list', /quieted: \[\],/, source);
matches('the quieted list is persisted', /quieted: state\.quieted,/, source);
matches('the effective branch policy is kept in the store', /branchMode: readBranchMode\(\),/, source);
matches('the store exposes setBranchMode', /setBranchMode\(mode\) \{/, source);
matches('a width change can drop stale measured heights', /resetHeights\(\) \{/, source);
matches('the quieted list is restored', /if \(Array\.isArray\(saved\.quieted\)\) state\.quieted = saved\.quieted;/, source);
matches('the store exposes setQuieted', /setQuieted\(ids\) \{/, source);

// --- runtime: the archive policy --------------------------------------------
const runtimeStart = source.indexOf('    function createRuntime(ctx) {');
const runtimeEnd = source.indexOf('    // -------------------------------------------------------------- markdown', runtimeStart);
assert.ok(runtimeStart > 0 && runtimeEnd > runtimeStart, 'runtime must exist');
const runtime = source.slice(runtimeStart, runtimeEnd);

matches('archive calls the workspace controller', /workspaces\.archiveSession\(sessionId, \{ stopActivity: true \}\)/, runtime);
matches('unarchive calls the workspace controller', /workspaces\.unarchiveSession\(sessionId\)/, runtime);
matches('the policy only archives when quiet is chosen', /snapshot\.branchMode \|\| readBranchMode\(\)\) !== 'quiet'/, runtime);
matches('a session is quieted once', /quieted\.indexOf\(sessionId\) >= 0/, runtime);
matches('it records quieted sessions in the store', /store\.setQuieted\(quieted\.concat\(sessionId\)\)/, runtime);
matches('finished branches are quieted after the turn', /quietBranch\(store, childId\)/, runtime);
matches('branches finished while away are quieted on read', /quietBranch\(store, current\.sessionId\)/, runtime);
doesNotMatch('a merely not-running branch is never quieted', /read2\.ended \|\| running === false\) && current\.sessionId\) \{\s*quietBranch/, runtime);
matches('a waiting branch is never quieted', /read2\.ended && !read2\.awaiting && running !== true/, runtime);
matches('a quieted parent is unarchived for the fork', /const parentQuieted = \(snapshot\.quieted \|\| \[\]\)\.indexOf\(parentNode\.sessionId\) >= 0/, runtime);
matches('the unarchive is awaited before the fork', /await Promise\.resolve\(unarchiveSession\(parentNode\.sessionId\)\)/, runtime);
matches('the parent is only re-quieted while the policy owns it', /const requietParent = \(\) => \{/, runtime);
matches('the re-quiet checks the mode', /latest\.branchMode \|\| readBranchMode\(\)\) !== 'quiet'\) return;/, runtime);
matches('the re-quiet checks the quieted list', /latest\.quieted \|\| \[\]\)\.indexOf\(parentNode\.sessionId\) < 0\) return;/, runtime);
doesNotMatch('deletion never pulls a quieted session into the restore list',
  /quieted\.has\(sessionId\)\) continue;[\s\S]{0,80}archived\.push\(sessionId\)/, runtime);

// The toggle migrates only finished visible branches and leaves deleted ones
// archived; switching back restores exactly what the policy put away.
matches('the toggle archives finished branches', /if \(RUNNING_STATUSES\.indexOf\(node\.status\) >= 0\) continue;/, runtime);
matches('the toggle does not re-archive an already quieted branch', /if \(quieted\.has\(node\.sessionId\)\) continue;/, runtime);
matches('the toggle skips waiting branches', /node\.awaiting === 'question' \|\| node\.awaiting === 'approval'\) continue;/, runtime);
matches('the toggle only touches visible sessions', /if \(!visible\.has\(sessionId\)\) \{ remaining\.push\(sessionId\); continue; \}/, runtime);
matches('switching back unarchives the quieted sessions', /for \(const sessionId of snapshot\.quieted \|\| \[\]\)/, runtime);
matches('switching back keeps sessions it could not restore', /if \(!unarchiveSession\(sessionId\)\) remaining\.push\(sessionId\);/, runtime);
matches('switching back stores the unhandled ids', /store\.setQuieted\(remaining\);/, runtime);
matches('the runtime exposes the switch', /deleteSubtree, restoreHidden, setBranchListing,/, runtime);

// --- the view exposes it ----------------------------------------------------
const canvasStart = source.indexOf('    function Canvas({ store, api, rootId, size }) {');
const canvasEnd = source.indexOf('    function Icon(', canvasStart);
assert.ok(canvasStart > 0 && canvasEnd > canvasStart, 'Canvas must exist');
const canvas = source.slice(canvasStart, canvasEnd);
matches('the toolbar shows how many branch rows exist', /const branchRows = liveNodes\.filter\(\(node\) => node\.kind === 'branch'/, canvas);
matches('the toolbar toggles the policy', /api\.setBranchListing\(rootId, branchMode === 'quiet' \? 'listed' : 'quiet'\)/, canvas);
matches('the view reads the effective policy from the store', /const branchMode = snapshot\.branchMode \|\| readBranchMode\(\);/, canvas);
matches('the toggle offers both labels', /T\('view\.branchesQuiet'\) : T\('view\.branchesShown'\)/, canvas);
matches('the toggle explains itself', /T\('view\.branchesQuietTitle'\) : T\('view\.branchesShownTitle'\)/, canvas);

const injectionStart = source.indexOf('            deleteSubtree: runtime.deleteSubtree,');
assert.ok(injectionStart > 0, 'the injected api must include the switch');
ok(source.indexOf('setBranchListing: runtime.setBranchListing,') > injectionStart,
  'the view receives the branch switch through the injected api');

// Restoring a tombstone in listed mode brings its quieted session back.
const restoreStart = source.indexOf('      function restoreHidden(rootId) {');
const restoreEnd = source.indexOf('\n      function remember(', restoreStart);
assert.ok(restoreStart > 0 && restoreEnd > restoreStart, 'restoreHidden must exist');
const restore = source.slice(restoreStart, restoreEnd);
matches('a restored node gets its quieted session back in listed mode', /if \(\(store\.getSnapshot\(\)\.branchMode \|\| readBranchMode\(\)\) !== 'listed'\) return;/, restore);

console.log(`BRANCH SESSIONS OK — ${checks} checks: archive policy, migration, fork safety, view switch`);
