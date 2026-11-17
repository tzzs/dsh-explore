/*
 * Wheel ownership.
 *
 * The canvas zooms on wheel, which is right on empty canvas and wrong the
 * moment the pointer is over something that scrolls by itself: expanding the
 * reasoning section gives it its own scrollbar, and scrolling that text used to
 * zoom the whole canvas instead of moving the text.
 *
 * `wheelOwner` decides who the event belongs to, and returns three different
 * things because the three cases need three different behaviours:
 *
 *   false     — nothing under the pointer scrolls, so the canvas zooms;
 *   'scroll'  — the box can move further this way: the browser must handle it
 *               natively and the canvas must not touch the event at all;
 *   'edge'    — the box is already at that end: the wheel does nothing, because
 *               falling through to the zoom is what made the canvas jump under
 *               a reader who had simply reached the bottom of the text.
 *
 * Runs in plain Node: no browser, no DOM, no dependencies.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');

// Pull the helper out of the bundle the same way test/motion.cjs pulls out
// useCanvasView: slice the real source, then run it against a fake window.
const start = source.indexOf('      function wheelOwner(');
const end = source.indexOf('      const onWheel = (event) => {', start);
assert.ok(start > 0 && end > start, 'wheelOwner must exist');

const makeWindow = () => ({
  getComputedStyle: (el) => el.style || {},
});
const factory = new Function('window', source.slice(start, end) + '\nreturn wheelOwner;');

function element(overflowY, extra) {
  return Object.assign({ style: { overflowY }, scrollHeight: 100, clientHeight: 100, scrollTop: 0, parentElement: null }, extra || {});
}

function chain(...elements) {
  for (let i = 0; i < elements.length - 1; i += 1) elements[i].parentElement = elements[i + 1];
  return elements[0];
}

let checks = 0;
function check(label, actual, expected) {
  assert.deepEqual(actual, expected, label);
  checks += 1;
}

// --- the canvas keeps the wheel when nothing below it scrolls -------------
{
  const wheelOwner = factory(makeWindow());
  const wrap = element('hidden');
  const card = chain(element('hidden'), wrap);
  check('plain card body is the canvas\'s wheel', wheelOwner(card, wrap, 120), false);

  const fits = chain(element('auto'), wrap); // scrollable but nothing to scroll
  check('a scroll box that fits does not swallow the wheel', wheelOwner(fits, wrap, 120), false);

  const hiddenOverflow = chain(element('hidden', { scrollHeight: 900, clientHeight: 100 }), wrap);
  check('a non-scrollable overflow does not swallow the wheel', wheelOwner(hiddenOverflow, wrap, 120), false);
}

// --- a real scroll box owns the wheel inside its range --------------------
{
  const wheelOwner = factory(makeWindow());
  const wrap = element('hidden');
  const box = element('auto', { scrollHeight: 900, clientHeight: 300, scrollTop: 200 });
  const text = chain(element('visible'), element('visible'), box, wrap);

  check('scrolling down inside the box is the box\'s', wheelOwner(text, wrap, 120), 'scroll');
  check('scrolling up inside the box is the box\'s', wheelOwner(text, wrap, -120), 'scroll');
}

// --- at either end the wheel does nothing at all -------------------------
{
  const wheelOwner = factory(makeWindow());
  const wrap = element('hidden');
  const atTop = element('auto', { scrollHeight: 900, clientHeight: 300, scrollTop: 0 });
  const atBottom = element('auto', { scrollHeight: 900, clientHeight: 300, scrollTop: 600 });

  check('wheel up at the top stops instead of zooming', wheelOwner(atTop, wrap, -120), 'edge');
  check('wheel down at the bottom stops instead of zooming', wheelOwner(atBottom, wrap, 120), 'edge');
  // The other direction still scrolls: the box is not stuck, only the end is.
  check('wheel down at the top still scrolls', wheelOwner(atTop, wrap, 120), 'scroll');
  check('wheel up at the bottom still scrolls', wheelOwner(atBottom, wrap, -120), 'scroll');
}

// --- the nearest owner wins ----------------------------------------------
{
  const wheelOwner = factory(makeWindow());
  const wrap = element('hidden');
  const outer = element('auto', { scrollHeight: 2000, clientHeight: 300, scrollTop: 500 });
  const inner = element('auto', { scrollHeight: 900, clientHeight: 200, scrollTop: 0 });
  const deep = chain(element('visible'), inner, element('hidden'), outer, wrap);

  check('the inner box owns its wheel, not the outer one', wheelOwner(deep, wrap, -120), 'edge');

  // Scrolling the other way the inner box can still move, so it keeps it too.
  check('the inner box keeps the wheel while it can scroll', wheelOwner(deep, wrap, 120), 'scroll');
}

// --- the walk never escapes the view -------------------------------------
{
  const wheelOwner = factory(makeWindow());
  const page = element('auto', { scrollHeight: 9000, clientHeight: 800, scrollTop: 400 });
  const wrap = chain(element('hidden'), page);
  check('a scrollable page outside the canvas is not consulted', wheelOwner(wrap, wrap, 120), false);
  check('no target at all falls through to the canvas', wheelOwner(null, wrap, 120), false);
  check('no wrap falls through to the canvas', wheelOwner(wrap, null, 120), false);
}

// --- the handler actually consults it, in the right order ----------------
{
  const handlerStart = source.indexOf('const onWheel = (event) => {', start);
  const handlerEnd = source.indexOf('const onMouseDown = (event) => {', handlerStart);
  assert.ok(handlerStart > 0 && handlerEnd > handlerStart, 'onWheel must exist');
  const handler = source.slice(handlerStart, handlerEnd);

  assert.match(handler, /wheelOwner\(event\.target, wrapRef\.current, event\.deltaY\)/,
    'onWheel must ask wheelOwner about the event target');
  const passThrough = handler.indexOf("if (owned === 'scroll') return;");
  const prevent = handler.indexOf('event.preventDefault()');
  assert.ok(passThrough > 0, 'a scrollable box must keep the event');
  assert.ok(prevent > 0, 'the canvas must still prevent the page from scrolling');
  assert.ok(passThrough < prevent,
    'the pass-through must come before preventDefault, or the browser never sees the wheel');
  assert.match(handler, /if \(owned === 'edge'\) return;/, 'an end-of-range wheel must stop, not zoom');
  assert.ok(handler.indexOf("if (owned === 'edge') return;") > prevent,
    'the edge case still prevents the page scroll before stopping');
  checks += 5;
}

console.log(`WHEEL OK — ${checks} checks, canvas yields to inner scroll areas and stops at their ends`);
