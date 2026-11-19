/*
 * Card display: the card is a preview, the reader shows the whole answer.
 *
 * Three things have to stay true for that split to hold:
 *
 *   1. the card has no in-place expansion — clicking the card (or its
 *      "read full screen" link) opens the reader instead. Expanding inside a
 *      320px card stretched it into a strip that was hard to use and hard to
 *      get back from;
 *   2. the preview is a real preference: three presets change the card width
 *      and how much of the answer is drawn, invalid or blocked storage falls
 *      back to the standard preset, and the geometry follows the chosen width;
 *   3. the reader offers a standard and a wide measure, remembered for the
 *      browser like the other preferences.
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

// --- the size presets -------------------------------------------------------
const presetsStart = source.indexOf('    const CARD_SIZES = {');
const presetsEnd = source.indexOf('    };', presetsStart);
assert.ok(presetsStart > 0 && presetsEnd > presetsStart, 'CARD_SIZES must exist');
const CARD_SIZES = new Function('NODE_W',
  source.slice(presetsStart, presetsEnd + '    };'.length) + '\nreturn CARD_SIZES;')(320);
ok(Object.keys(CARD_SIZES).join(',') === 'compact,standard,roomy', 'three presets, in order');
ok(CARD_SIZES.standard.width === 320, 'the standard preset is the historical 320px card');
ok(CARD_SIZES.compact.width < CARD_SIZES.standard.width, 'compact is narrower than standard');
ok(CARD_SIZES.roomy.width > CARD_SIZES.standard.width, 'roomy is wider than standard');
for (const name of ['compact', 'standard', 'roomy']) {
  const preset = CARD_SIZES[name];
  ok(preset.preview > 0, `${name} bounds the preview height`);
  ok(preset.truncate > 0, `${name} bounds how much Markdown a card parses`);
  ok(preset.maskAt < preset.truncate, `${name} fades before it truncates`);
}
ok(CARD_SIZES.compact.preview < CARD_SIZES.standard.preview, 'compact previews fewer lines');
ok(CARD_SIZES.roomy.preview > CARD_SIZES.standard.preview, 'roomy previews more lines');
ok(CARD_SIZES.compact.truncate < CARD_SIZES.standard.truncate, 'compact parses less text');
ok(CARD_SIZES.roomy.truncate > CARD_SIZES.standard.truncate, 'roomy parses more text');

// --- the preference helpers -------------------------------------------------
const helperStart = source.indexOf('    const CARD_SIZE_KEY');
const helperEnd = source.indexOf('    // Font families follow Settings');
assert.ok(helperStart > 0 && helperEnd > helperStart, 'display preference helpers must exist');
const store = new Map();
const safeWindow = { localStorage: {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, value),
} };
const display = new Function('NODE_W', 'window',
  source.slice(helperStart, helperEnd)
  + '\nreturn { readCardSize, saveCardSize, readReaderWidth, saveReaderWidth, READER_WIDTHS, CARD_SIZES };')(320, safeWindow);

assert.equal(display.readCardSize(), 'standard', 'the default card size is standard');
display.saveCardSize('roomy');
assert.equal(display.readCardSize(), 'roomy', 'the card size is remembered');
store.set('dsh-explore:card-size', 'giant');
assert.equal(display.readCardSize(), 'standard', 'an invalid card size falls back to standard');

assert.equal(display.readReaderWidth(), 'standard', 'the default reader width is standard');
display.saveReaderWidth('wide');
assert.equal(display.readReaderWidth(), 'wide', 'the reader width is remembered');
store.set('dsh-explore:reader-width', 'column');
assert.equal(display.readReaderWidth(), 'standard', 'an invalid reader width falls back to standard');
ok(/820px/.test(display.READER_WIDTHS.standard), 'the standard reader is the 820px measure');
ok(/1200px/.test(display.READER_WIDTHS.wide), 'the wide reader is the 1200px measure');
ok(/100vw/.test(display.READER_WIDTHS.standard)
  && /100vw/.test(display.READER_WIDTHS.wide), 'both reader widths stay inside the viewport');

const blocked = new Function('NODE_W', 'window',
  source.slice(helperStart, helperEnd)
  + '\nreturn { readCardSize, readReaderWidth, saveCardSize, saveReaderWidth };')(320, {
  localStorage: {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  },
});
assert.equal(blocked.readCardSize(), 'standard', 'blocked storage still gives the default card size');
assert.equal(blocked.readReaderWidth(), 'standard', 'blocked storage still gives the default reader width');
blocked.saveCardSize('roomy');
blocked.saveReaderWidth('wide');
ok(true, 'blocked storage must not throw when saving a display preference');

// --- the card no longer expands in place ------------------------------------
const cardStart = source.indexOf('    function NodeCard(');
const cardEnd = source.indexOf('\n    function Composer(', cardStart);
assert.ok(cardStart > 0 && cardEnd > cardStart, 'NodeCard must exist');
const card = source.slice(cardStart, cardEnd);
doesNotMatch('the card has no expand state', /setExpanded|expanded \?/, card);
doesNotMatch('the card no longer reads a card.expand key', /card\.(?:expand|collapse|expandTitle|collapseTitle)/, card);
doesNotMatch('the expand strings are gone from every dictionary', /'card\.(?:expand|collapse|expandTitle|collapseTitle)':/, source);

// The fullscreen entry point is present whenever there is an answer to read,
// short answers included — the old answer-length condition hid it exactly on
// the cards that looked like they had nothing to open.
matches('the footer is drawn for any answered card', /answer \|\| childCount > 0/, card);
matches('the footer offers the reader', /T\('card\.fullscreen'\)/, card);
matches('the footer opens the reader', /store\.openReader\(node\.id\)/, card);
matches('the blank part of the footer row opens the reader too', /target\.closest\('button'\)/, card);

// The preview follows the preset rather than three hard-coded numbers.
matches('the preview height comes from the preset', /maxHeight: cardPreview\.preview/, card);
matches('the fade threshold comes from the preset', /cardPreview\.maskAt/, card);
matches('the parse cap comes from the preset', /cardPreview\.truncate/, card);
matches('the card width comes from the preset', /width: cardWidth/, card);

// --- the geometry follows the chosen card width -----------------------------
const geometryStart = source.indexOf('    function childrenMapOf(');
const geometryEnd = source.indexOf('    // ------------------------------------------------------------------ store', geometryStart);
assert.ok(geometryStart > 0 && geometryEnd > geometryStart, 'the geometry functions must exist');
const layoutTree = new Function('NODE_W', 'NODE_H', 'GAP_X', 'GAP_Y',
  source.slice(geometryStart, geometryEnd) + '\nreturn layoutTree;')(320, 212, 44, 76);
const nodes = [{ id: 'root', parentId: null }, { id: 'child', parentId: 'root' }];
const heights = { root: 180, child: 180 };
const classic = layoutTree(nodes, {}, heights, 'horizontal');
assert.equal(classic.positions.get('child').x, 320 + 76, 'a 320px card keeps the historical gap');
const narrow = layoutTree(nodes, {}, heights, 'horizontal', 288);
assert.equal(narrow.positions.get('child').x, 288 + 76, 'a 288px card shifts the child left');
assert.equal(narrow.width, 288 + 76 + 288, 'the canvas width follows the card width');
const wide = layoutTree(nodes, {}, heights, 'horizontal', 448);
assert.equal(wide.positions.get('child').x, 448 + 76, 'a 448px card shifts the child right');
assert.equal(wide.edges[0].x1, 448, 'the edge leaves a 448px card at its right edge');
assert.equal(wide.edges[0].x2, wide.positions.get('child').x, 'the edge reaches the child');
checks += 4;

// --- the reader's width preference ------------------------------------------
const readerStart = source.indexOf('    function Reader({ node, open, onClose, reasoningOpen }) {');
const readerEnd = source.indexOf('\n    function TreeView(props) {', readerStart);
assert.ok(readerStart > 0 && readerEnd > readerStart, 'Reader must exist');
const reader = source.slice(readerStart, readerEnd);
matches('the reader reads the width preference', /useState\(readReaderWidth\)/, reader);
matches('the dialog takes the preset width', /style: \{ width: readerWidth, maxWidth: 'calc\(100vw - 24px\)' \}/, reader);
matches('the reader persists the chosen width', /saveReaderWidth\('wide'\)/, reader);
matches('the reader offers the standard measure', /T\('reader\.widthStandard'\)/, reader);
matches('the reader offers the wide measure', /T\('reader\.widthWide'\)/, reader);
matches('the width group is announced', /'aria-label': T\('reader\.widthGroup'\)/, reader);
doesNotMatch('the reader still opens as a modal', /dialog\.show\(\)/, reader);
const readerRule = source.match(/\.dsh-tree-reader \{[^}]*\}/);
assert.ok(readerRule, 'the reader surface rule must exist');
doesNotMatch('the reader width has one source (the preset)', /(?:^|\s)width\s*:/, readerRule[0]);

// --- the toolbar exposes the card size --------------------------------------
const canvasStart = source.indexOf('    function Canvas({ store, api, rootId, size, ready }) {');
const canvasEnd = source.indexOf('    function Icon(', canvasStart);
assert.ok(canvasStart > 0 && canvasEnd > canvasStart, 'Canvas must exist');
const canvas = source.slice(canvasStart, canvasEnd);
matches('culling uses the chosen card width', /pos\.x \+ cardWidth >= left/, canvas);
matches('the focus camera uses the chosen card width', /pos\.x \+ cardWidth \/ 2/, canvas);
matches('the minimap uses the chosen card width', /width: cardWidth,/, canvas);
matches('a size change drops heights measured at the old width', /store\.resetHeights\(\);/, canvas);
matches('the toolbar has a card-size group', /T\('view\.cardSizeGroup'\)/, canvas);
matches('each preset is a pressed-state segment', /'aria-pressed': cardSize === size/, canvas);
matches('the layout follows the card width', /layoutTree\(liveNodes, collapsedMap, snapshot\.heights, direction, cardWidth\)/, canvas);

console.log(`CARD DISPLAY OK — ${checks} checks: presets, no in-card expand, reader width, geometry`);
