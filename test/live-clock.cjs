/*
 * The running card's clock.
 *
 * A card shows how long the turn has been running. That number used to come
 * from `turnCost().ms`, which can only measure between durable events — so
 * during one long thinking step it froze for minutes and then jumped when the
 * step settled. It looked like a broken clock rather than a busy agent.
 *
 * The fix is `liveElapsedMs`, which measures against the wall clock instead.
 * This test pins the helper's behaviour and the two things that would silently
 * undo the fix:
 *
 *   1. both readers (the card header and the live progress row) go through the
 *      helper rather than back to `cost.ms`;
 *   2. there is exactly one interval in the bundle, because a second clock
 *      would let the header and the row disagree by a second.
 *
 * Runs in plain Node: no browser, no DOM, no dependencies.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');

// Pull the helper out of the bundle and run it, like test/motion.cjs does.
const start = source.indexOf('    function liveElapsedMs(');
const end = source.indexOf('    /** Re-render the caller once a second', start);
assert.ok(start > 0 && end > start, 'liveElapsedMs must exist');
const liveElapsedMs = new Function(source.slice(start, end) + '\nreturn liveElapsedMs;')();

let checks = 0;
function check(label, actual, expected) {
  assert.equal(actual, expected, label);
  checks += 1;
}

// --- what it measures ----------------------------------------------------
const startedAt = 1_700_000_000_000;
const node = { startedAt };

check('no node is no time', liveElapsedMs(null, startedAt + 5000), 0);
check('a node without startedAt has no clock', liveElapsedMs({}, startedAt + 5000), 0);
check('no clock reading is no time', liveElapsedMs(node, 0), 0);
check('immediately after the start it is zero', liveElapsedMs(node, startedAt), 0);
check('one second in', liveElapsedMs(node, startedAt + 1000), 1000);
check('a long thinking step keeps counting', liveElapsedMs(node, startedAt + 600_000), 600_000);
// A skewed clock (or a restored snapshot from another machine) must not print
// a negative duration.
check('a clock behind the start clamps at zero', liveElapsedMs(node, startedAt - 30_000), 0);

// It must not read the projection's cost: a node whose cost is empty still has
// a clock while it runs, and that was exactly the bug.
check('an empty cost does not blank the clock',
  liveElapsedMs({ startedAt, cost: { ms: 0, tokens: 0 } }, startedAt + 7000), 7000);

// --- the two readers use it ---------------------------------------------
const header = (() => {
  const at = source.indexOf('ms: liveElapsedMs(node, now)');
  assert.ok(at > 0, 'the card header must read the clock, not cost.ms');
  return source.slice(Math.max(0, at - 900), at + 200);
})();
assert.match(header, /isRunning && node\.startedAt/, 'the header clock must only run on an open turn');
assert.doesNotMatch(header, /formatCost\(node\.cost\)/, 'the header must not print the settled cost while running');
checks += 2;

const liveAt = source.indexOf('const elapsed = Math.round(liveElapsedMs(node, now) / 1000)');
assert.ok(liveAt > 0, 'the live row must read the same clock');
const liveStart = source.lastIndexOf('function LiveProgress(', liveAt);
const liveEnd = source.indexOf('\n    function ', liveAt);
assert.ok(liveStart > 0 && liveEnd > liveAt, 'LiveProgress must be a single component');
const live = source.slice(liveStart, liveEnd);
assert.match(live, /function LiveProgress\(\{ node, now \}\)/, 'the live row takes the card clock as a prop');
assert.doesNotMatch(live, /setInterval/, 'the live row must not start a second clock');
checks += 2;

// --- one clock per card --------------------------------------------------
const intervals = (source.match(/setInterval\(/g) || []).length;
assert.equal(intervals, 1, 'exactly one interval may exist (the card clock), found ' + intervals);
check('the ticker is the one interval', /function useTicker\(active\)/.test(source), true);
check('the ticker stops when the turn ends', /if \(!active\) return undefined;/.test(source), true);
check('the ticker cleans its interval up', /clearInterval\(timer\)/.test(source), true);

console.log(`LIVE CLOCK OK — ${checks} checks, the running card counts wall clock and owns a single timer`);
