/*
 * The explore view is a view, not an overlay over the host's chrome.
 *
 * The bug this pins down: the canvas used to portal itself into the
 * conversation root and cover the session header, then win the tab row back
 * with a `:has() > header { z-index }` rule. That rule is host-shaped, and
 * where it did not match the title row and the View tabs disappeared with the
 * composer. The view now renders in place under the host's
 * `data-conversation-composer-overlay` contract, so the header is never
 * inside the canvas's box and needs no stacking order at all.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');
const start = source.indexOf('    function TreeView(props) {');
const end = source.indexOf('    // ------------------------------------------------------------------ mount', start);
assert(start >= 0 && end > start);

function mount() {
  const states = [];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  let effects = [];
  let readingId = null;
  const observations = [];
  const canvasElement = { clientWidth: 900, clientHeight: 600 };
  const store = {
    subscribe: () => () => {},
    // The reader is one value: which node is open and which of its bodies is
    // on screen. The mock follows that contract, not the old id+boolean pair.
    getSnapshot: () => ({ reading: readingId ? { nodeId: readingId, pane: 'result' } : null }),
    getNode: () => ({ id: readingId }),
  };
  const api = { rootOf: id => id, storeFor: () => store, ensureOpen() {} };
  const h = (type, props, ...children) => ({ type, props: { ...props, children } });
  const useState = initial => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
    return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
  };
  const useRef = initial => {
    const index = refIndex++;
    return refs[index] || (refs[index] = { current: initial ?? null });
  };
  const useEffect = effect => { effects.push(effect); };
  const ResizeObserver = class {
    constructor(callback) { this.callback = callback; }
    observe(element) { observations.push(element); }
    disconnect() {}
  };
  // A host that offered createPortal would still be ignored: the view must not
  // reach over the host's chrome even when the means are available.
  const createPortal = (child, target) => ({ type: 'portal', child, target });
  const TreeView = new Function('h', 'useLocale', 'useState', 'useRef', 'useMemo', 'useEffect', 'require',
    'ResizeObserver', 'Boundary', 'Canvas', 'Reader', 'FONT', 'C',
    source.slice(start, end) + '\nreturn TreeView;')(
    h, () => {}, useState, useRef, fn => fn(), useEffect,
    name => name === 'react-dom' ? { createPortal } : null,
    ResizeObserver, 'Boundary', 'Canvas', 'Reader', 'sans-serif', { ink: 'ink', canvas: 'canvas' });
  const render = () => {
    stateIndex = 0;
    refIndex = 0;
    effects = [];
    return TreeView({ sessionId: 'fixture', api });
  };
  render();
  refs[0].current = canvasElement;
  for (const effect of effects) effect();
  return { render, observations, canvasElement, read: id => { readingId = id; } };
}

const fixture = mount();
const root = fixture.render();

assert.notEqual(root.props.children[0].type, 'portal', 'the canvas never portals over the host chrome');
assert.equal(root.props.className, 'dsh-tree-root', 'the canvas is a plain view root');
assert.equal(root.props['data-conversation-composer-overlay'], '',
  'the canvas claims the host composer-overlay contract so it owns the footer');
assert.equal(root.props.style.position, 'relative', 'the canvas keeps its own box inside the view area');

const canvas = root.props.children[0];
assert.equal(canvas.type, 'Boundary');
const surface = canvas.props.children[0];
assert.deepEqual(surface.props.size, { w: 900, h: 600 }, 'the camera measures the view box only');
assert.equal(surface.props.ready, undefined, 'no host chrome measurement gates the camera');
assert(fixture.observations.includes(fixture.canvasElement), 'the view box is observed for resizing');

fixture.read('root');
const reading = fixture.render();
assert.equal(reading.props.children[1].props.open, true, 'the reader still opens on top of the view');

// The stylesheet is what actually hides the composer seat and drops the
// header z-index hack the old overlay needed.
const styleStart = source.indexOf("style.textContent = [");
const styleEnd = source.indexOf("].join('\\n');", styleStart);
assert(styleStart >= 0 && styleEnd > styleStart);
const sheet = source.slice(styleStart, styleEnd);
assert.match(sheet, /\[data-conversation-scroll\]:has\(> \[data-slot="conversation\.session"\] \.dsh-tree-root\) > \[data-composer-seat\] \{ display: none !important; \}/,
  'the composer seat is hidden for exactly the span the canvas occupies');
assert.equal(sheet.indexOf('> header { position: relative; z-index: 2; }'), -1,
  'the header no longer depends on a stacking order it does not control');
assert.equal(sheet.indexOf('.dsh-tree-root--overlay'), -1, 'no overlay mode is left to keep in sync');

console.log('HOST CHROME OK: canvas stays inside the view, composer hidden, no header z-index hack');
