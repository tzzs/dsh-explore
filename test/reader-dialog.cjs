/*
 * The full-screen reader is a native modal dialog.
 *
 * It used to be a hand-built overlay: a positioned div with role="dialog",
 * aria-modal, a manual Tab trap, a manual Esc handler and manual focus
 * restoration. Every one of those is something the browser already does for
 * `<dialog>.showModal()`, and the hand-built version could not do two of them
 * at all — the page behind stayed interactive, and the overlay lived inside the
 * transformed canvas instead of the top layer.
 *
 * This test pins the wiring that makes the native dialog behave, and the three
 * CSS rules whose absence is silent:
 *
 *   1. it is opened with showModal(), never show();
 *   2. the dismissal the browser performs is mirrored back into React state;
 *   3. it carries no role="dialog" / aria-modal / focus trap of its own;
 *   4. the backdrop is a scroll container with contained overscroll, and the
 *      dialog itself contains overscroll, or a gesture over the backdrop
 *      scrolls the page underneath;
 *   5. `display` is never set on the closed dialog, which would override the
 *      closed state and leave the reader on screen forever.
 *
 * Runs in plain Node: no browser, no DOM, no dependencies.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');

const start = source.indexOf('    function Reader({ node, open, onClose }) {');
const end = source.indexOf('\n    function TreeView(props) {', start);
assert.ok(start > 0 && end > start, 'Reader must exist');
const reader = source.slice(start, end);

let checks = 0;
function check(label, actual, expected) {
  assert.equal(actual, expected, label);
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

// --- it is a real modal ------------------------------------------------
matches('opens with showModal()', /dialog\.showModal\(\)/, reader);
doesNotMatch('never uses the non-blocking show()', /dialog\.show\(\)/, reader);
matches('mirrors the browser close into React state',
  /addEventListener\('close', onDismiss\)/, reader);
matches('subscribes once, not per render', /\}, \[\]\);/, reader);

// --- it does not rebuild what the browser provides ---------------------
doesNotMatch('no role="dialog" on a native dialog', /role: 'dialog'/, reader);
doesNotMatch('no aria-modal on a native modal', /'aria-modal'/, reader);
doesNotMatch('no manual Tab trap', /event\.key === 'Tab'/, reader);
doesNotMatch('no manual Esc handler', /event\.key === 'Escape'/, reader);
doesNotMatch('no manual focus restoration', /previousFocus/, reader);
matches('names the dialog with a heading id',
  /'aria-labelledby': titleId/, reader);
matches('actually gives an element that id', /id: titleId,/, reader);
matches('offers light dismiss', /closedby: 'any'/, reader);

// --- CSS: the parts whose absence fails silently ----------------------
const cssRule = (selector) => {
  const pattern = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{[^}]*\\}');
  const found = source.match(pattern);
  assert.ok(found, 'CSS rule not found: ' + selector);
  checks += 1;
  return found[0];
};

const dialogRule = cssRule('.dsh-tree-reader');
matches('the dialog contains overscroll', /overscroll-behavior: contain;/, dialogRule);
matches('the dialog transitions the top layer',
  /transition-property: opacity, transform, display, overlay;/, dialogRule);
matches('the dialog allows discrete transitions', /transition-behavior: allow-discrete;/, dialogRule);
doesNotMatch('the closed dialog keeps the UA display:none', /display:/, dialogRule);

const openRule = cssRule('.dsh-tree-reader[open]');
matches('only the open dialog is laid out', /display: flex;/, openRule);

const backdrop = cssRule('.dsh-tree-reader::backdrop');
matches('the backdrop is the scrim', /background: var\(--dsw-alias-bg-mask-1\)/, backdrop);
matches('the backdrop becomes a scroll container', /overflow: hidden;/, backdrop);
matches('the backdrop contains overscroll', /overscroll-behavior: contain;/, backdrop);

// The listener form is what proves the reader is driven by state rather than
// by its own open attribute.
matches('the dialog element is rendered, not a wrapper div',
  /return h\('dialog', \{/, reader);

console.log(`READER DIALOG OK — ${checks} checks, native modal with no hand-built focus or dismissal code`);
