const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');
const start = source.indexOf('    function TreeView(props) {');
const end = source.indexOf('    // ------------------------------------------------------------------ mount', start);
assert(start >= 0 && end > start);

function mount(withHeader = true) {
  const states = [];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  let effects = [];
  let readingId = null;
  const observations = [];
  const header = { getBoundingClientRect: () => ({ bottom: 76 }) };
  const composer = { getBoundingClientRect: () => ({ top: 500 }) };
  const container = {
    querySelector(selector) {
      if (selector === ':scope > header') return null;
      if (selector === ':scope > [data-slot="conversation.header"] > header') return withHeader ? header : null;
      return null;
    },
  };
  const body = { parentElement: container, querySelector: selector => selector === '[data-composer-seat]' ? composer : null };
  const anchor = { closest: selector => selector === '[data-conversation-content]' ? body : null };
  const canvasElement = { clientWidth: 900, clientHeight: 600, getBoundingClientRect: () => ({ top: 0, bottom: 600 }) };
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
  const initial = render();
  refs[0].current = anchor;
  refs[1].current = canvasElement;
  effects[2]();
  if (!withHeader) return { initial, current: render() };
  const overlay = render();
  effects[3]();
  return { container, header, composer, observations, initial, render, read: id => { readingId = id; } };
}

const fixture = mount();
let portal = fixture.render().props.children[0];
assert.equal(portal.type, 'portal', 'canvas is mounted above the host content');
assert.equal(portal.target, fixture.container, 'canvas uses the conversation container');
assert.equal(portal.child.props.style.zIndex, 1, 'host controls stay above the canvas');
const canvas = portal.child.props.children[0].props.children[0];
assert.deepEqual(canvas.props.size, { w: 900, h: 600, top: 76, bottom: 100, container: fixture.container });
assert.equal(canvas.props.ready, true, 'the camera waits for the overlay dimensions');
assert(fixture.observations.includes(fixture.header) && fixture.observations.includes(fixture.composer), 'host chrome is observed for resizing');
fixture.read('root');
portal = fixture.render().props.children[0];
assert.equal(portal.child.props.style.zIndex, 20, 'the reader covers the host controls');
const fallback = mount(false);
assert.notEqual(fallback.current.props.children[0].type, 'portal', 'unsupported host layouts retain the ordinary canvas');
console.log('HOST OVERLAY OK: host header, composer, resizing, reader, and fallback');
