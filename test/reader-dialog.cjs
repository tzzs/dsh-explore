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
 *      closed state and leave the reader on screen forever;
 *   6. the dialog surface itself never starts transparent and never animates
 *      the top layer: a click that opens the reader must never be able to
 *      leave it invisible (or stuck after a fast close/reopen pair).
 *
 * Runs in plain Node: no browser, no DOM, no dependencies.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');

const start = source.indexOf('    function Reader({ node, open, onClose, pane, onPane }) {');
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
// The listener has to be re-attached when the dialog mounts: the component
// renders no <dialog> until a node is open, so a mount-once effect finds
// nothing, bails out, and Esc then dismisses the element without clearing the
// store — which leaves the canvas inert with no dialog to close it.
matches('subscribes when the dialog mounts, not once on an empty mount',
  /addEventListener\('close', onDismiss\);[\s\S]{0,400}\}, \[node && node\.id\]\);/, reader);
// `cancel` fires before the element closes. Clearing the store there lifts the
// canvas's `inert` before the browser restores focus, so Esc hands focus back
// to the button that opened the reader instead of dropping it on <body>.
matches('the dismissal is mirrored before the element closes', /addEventListener\('cancel', onCancel\)/, reader);

// --- it does not rebuild what the browser provides ---------------------
doesNotMatch('no role="dialog" on a native dialog', /role: 'dialog'/, reader);
doesNotMatch('no aria-modal on a native modal', /'aria-modal'/, reader);
doesNotMatch('no manual Tab trap', /event\.key === 'Tab'/, reader);
doesNotMatch('no manual Esc handler', /event\.key === 'Escape'/, reader);
doesNotMatch('no manual focus restoration', /previousFocus/, reader);
matches('names the dialog with a heading id',
  /'aria-labelledby': titleId/, reader);
matches('actually gives an element that id', /id: titleId,/, reader);
matches('a backdrop click is handled explicitly', /if \(event\.target !== dialogRef\.current\) return;/, reader);
matches('the opening click cannot dismiss the reader', /Date\.now\(\) - openedAt\.current < 350/, reader);
// A reading id that no longer resolves must not leave the canvas inert with
// no dialog to close; both the inert flag and a reconciliation effect guard it.
matches('the canvas is inert only while the reading node resolves',
  /inert: snapshot\.reading \? true : undefined,/, source);
matches('a stale reading id is closed',
  /if \(readingState && !reading\) store\.closeReader\(\);/, source);
doesNotMatch('no native closedby light dismiss', /closedby:/, reader);

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
doesNotMatch('the dialog surface never starts transparent', /opacity:\s*0/, dialogRule);
doesNotMatch('the dialog itself has no transition', /transition/, dialogRule);
doesNotMatch('the dialog does not animate the top layer',
  /transition-property:[^;]*(?:display|overlay)/, dialogRule);
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

// --- one body, one pane, one scroll container ------------------------------
// The reader used to hold the chain and the answer together, with the chain
// folded above the answer. That made the reader two documents in one column
// and gave the "思考过程" row a fold of its own. The pane switch replaces both:
// the reader renders exactly one of the two documents, chosen by the store.
check('one scroll container', (reader.match(/className: 'dsh-tree-scroll'/g) || []).length, 1);
matches('the body renders the active pane', /h\(ReaderPane, \{ node, reading, pane: activePane \}\)/, reader);
matches('a pane switch restarts the other document at its top', /key: activePane,/, reader);
matches('the reader gets the pane from the store-backed props', /const activePane = pane === 'reasoning' && reading\.hasReasoning \? 'reasoning' : 'result';/, reader);

// The pane switch is a two-segment group with exactly one pressed segment. It
// reuses the toggle idiom the layout, card-size and width groups already use,
// rather than a tablist, whose arrow-key navigation would be hand-written
// keyboard code inside the very dialog that exists to avoid it.
matches('the pane group is announced', /'aria-label': T\('reader\.paneGroup'\)/, reader);
matches('the answer pane is a pressed-state segment', /'aria-pressed': activePane === 'result'/, reader);
matches('the reasoning pane is a pressed-state segment', /'aria-pressed': activePane === 'reasoning'/, reader);
matches('the pane group only exists when the node has a chain',
  /reading\.hasReasoning\s*\n?\s*\? h\('div'/, reader);

// The pane switch and the width group share one row, at opposite ends. Two
// groups in the header would leave the question a fraction of an 820px dialog.
const toolbarAt = reader.indexOf("'aria-label': T('reader.paneGroup')");
const widthAt = reader.indexOf("'aria-label': T('reader.widthGroup')");
assert.ok(toolbarAt > 0 && widthAt > toolbarAt, 'the two groups live in one toolbar row');
checks += 1;
matches('the toolbar row separates them', /h\('span', \{ style: \{ flex: 1 \} \}\),/, reader);

// The dialog takes focus itself. `showModal()` alone focuses the first
// focusable descendant — the close button — so a reflexive Enter would dismiss
// the document the reader just opened.
matches('the dialog is focusable without script', /tabIndex: '-1',/, reader);
matches('the reader focuses the dialog, not its first button',
  /if \(typeof dialog\.focus === 'function'\) dialog\.focus\(\);/, reader);

// --- the card has exactly one enlarge entry --------------------------------
const cardStart = source.indexOf('    function NodeCard(');
const cardEnd = source.indexOf('\n    function Composer(', cardStart);
assert.ok(cardStart > 0 && cardEnd > cardStart, 'NodeCard must exist');
const card = source.slice(cardStart, cardEnd);
check('exactly one enlarge call site on the card',
  (card.match(/store\.openReader\(/g) || []).length, 1);
doesNotMatch('no caller can ask the reader for a mode', /reasoning: true/, card);
doesNotMatch('the answer body is no longer a target', /card\.readTitle/, card);
doesNotMatch('the thinking is no longer a target', /dsh-tree-reasoning-tail/, card);
matches('the card keeps the one button', /T\('card\.fullscreen'\)/, card);
doesNotMatch('the card no longer draws a reasoning panel',
  /ReasoningRow|dsh-tree-reasoning-preview/, card);

console.log(`READER DIALOG OK — ${checks} checks, native modal with no hand-built focus or dismissal code`);
