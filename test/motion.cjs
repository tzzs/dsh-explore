/* Camera motion must track actual coordinates, yield to gestures and respect
 * a motion-preference change during navigation. Runs without a browser. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');
const start = source.indexOf('    const MOTION_EXIT_MS');
const end = source.indexOf('    function Badge(', start);
assert(start >= 0 && end > start, 'motion helpers must exist');

function camera() {
  let value;
  let id = 0;
  let listener;
  let cleanup;
  const frames = new Map();
  const media = {
    matches: false,
    addEventListener(type, callback) { assert.equal(type, 'change'); listener = callback; },
    removeEventListener(type, callback) { assert.equal(callback, listener); listener = null; },
  };
  const window = {
    matchMedia: () => media,
    requestAnimationFrame(callback) { frames.set(++id, callback); return id; },
    cancelAnimationFrame(frame) { frames.delete(frame); },
  };
  const useState = initial => {
    value = initial;
    return [value, next => { value = next; }];
  };
  const useRef = initial => ({ current: initial });
  const useCallback = fn => fn;
  const useEffect = effect => { cleanup = effect(); };
  const useCanvasView = new Function('useState', 'useRef', 'useCallback', 'useEffect', 'window',
    source.slice(start, end) + '\nreturn useCanvasView;')(useState, useRef, useCallback, useEffect, window);
  const [, move, cancel] = useCanvasView();
  return {
    move, cancel,
    value: () => value,
    pending: () => frames.size,
    frame(time) {
      const work = [...frames.values()];
      frames.clear();
      work.forEach(callback => callback(time));
    },
    reduce() { media.matches = true; if (listener) listener(); },
    cleanup: () => cleanup(),
    listening: () => Boolean(listener),
  };
}

const target = { x: -860, y: -440, z: 0.65 };
const c = camera();
c.move(target, true);
c.frame(0);
c.frame(160);
const mid = c.value();
assert(mid.x < 40 && mid.x > target.x, 'camera passes through actual intermediate positions');
assert(mid.y < 40 && mid.y > target.y);
assert(mid.z < 1 && mid.z > target.z);
c.frame(320);
assert.deepEqual(c.value(), target, 'navigation reaches its exact destination');
assert.equal(c.pending(), 0);

c.move({ x: 100, y: 80, z: 1 }, true);
c.frame(400);
c.frame(480);
const interrupted = { ...c.value() };
c.cancel();
c.frame(1000);
assert.deepEqual(c.value(), interrupted, 'gesture cancellation stops at the visible location');
assert.equal(c.pending(), 0);
c.move(view => ({ ...view, x: view.x + 37, y: view.y - 12 }));
assert.equal(c.value().x, interrupted.x + 37, 'direct input starts from the current camera');
assert.equal(c.value().y, interrupted.y - 12);
assert.equal(c.pending(), 0, 'direct input never queues interpolation');

c.move({ x: 900, y: 600, z: 1.8 }, true);
c.frame(1100);
c.frame(1180);
const newStart = { ...c.value() };
const replacement = { x: 0, y: 0, z: 1 };
c.move(replacement, true);
c.frame(1200);
assert.deepEqual(c.value(), newStart, 'a new navigation starts at the interrupted position');
c.frame(1520);
assert.deepEqual(c.value(), replacement, 'old navigation cannot overwrite its replacement');

c.move(target, true);
c.frame(1600);
c.frame(1680);
c.reduce();
assert.deepEqual(c.value(), target, 'enabling reduced motion finishes the current navigation');
assert.equal(c.pending(), 0);
c.move(replacement, true);
assert.deepEqual(c.value(), replacement, 'reduced motion applies subsequent navigation immediately');
assert.equal(c.pending(), 0);
c.cleanup();
assert.equal(c.listening(), false, 'unmount removes the media listener');

const unmount = camera();
unmount.move(target, true);
unmount.cleanup();
assert.equal(unmount.pending(), 0, 'unmount cancels all animation frames');
console.log('MOTION OK — interpolation, gesture interruption, replacement, reduced motion and cleanup');
