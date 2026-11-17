/*
 * Markdown tables.
 *
 * The renderer handled headings, lists, quotes and fences but not tables, so a
 * GFM table from the model came out as one paragraph of pipes — which is what a
 * reader sees whenever an answer compares options. This drives the real
 * renderer out of the bundle and checks both halves of the fix:
 *
 *   1. a pipe row followed by a delimiter row becomes a real <table>, with the
 *      delimiter's colons turned into cell alignment;
 *   2. pipes that are not a table (no delimiter) still render as prose, and an
 *      escaped `\|` stays a literal pipe inside its cell.
 *
 * The table also has to be able to be wider than the reader, so the wrapper
 * that owns the horizontal scroll is asserted too.
 *
 * Runs in plain Node: no browser, no DOM, no dependencies.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');

const start = source.indexOf('    function inlineNodes(text, keyBase) {');
const end = source.indexOf('    function Chevron({ dir, size, color }) {', start);
assert.ok(start > 0 && end > start, 'the markdown renderer must exist');

// A minimal element factory: the renderer only needs type + props + children.
const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat().filter((c) => c !== null && c !== undefined && c !== false) });
const MD = {};
const factory = new Function('h', 'MD', source.slice(start, end) + '\nreturn { renderMarkdown, splitTableRow, isTableDelimiter };');
const md = factory(h, MD);

let checks = 0;
function check(label, actual, expected) {
  assert.deepEqual(actual, expected, label);
  checks += 1;
}

/** Depth-first search of the rendered tree. */
function findAll(node, predicate, out = []) {
  if (!node || typeof node === 'string') return out;
  if (Array.isArray(node)) { node.forEach((child) => findAll(child, predicate, out)); return out; }
  if (predicate(node)) out.push(node);
  (node.children || []).forEach((child) => findAll(child, predicate, out));
  return out;
}
function textOf(node) {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (!node) return '';
  return (node.children || []).map(textOf).join('');
}

// --- splitting -----------------------------------------------------------
check('outer pipes are optional', md.splitTableRow('| a | b |'), ['a', 'b']);
check('bare rows split too', md.splitTableRow('a | b'), ['a', 'b']);
check('an escaped pipe stays in its cell', md.splitTableRow('| a \\| b | c |'), ['a | b', 'c']);

// --- delimiter detection -------------------------------------------------
check('a delimiter row is recognised', md.isTableDelimiter('| --- | :---: | ---: |'), true);
check('prose is not a delimiter row', md.isTableDelimiter('just some text'), false);

// --- a real table --------------------------------------------------------
{
  const doc = [
    '| Option | Cost | Notes |',
    '| --- | :---: | ---: |',
    '| canvas | 2 MB | fast |',
    '| svg | 40 KB | crisp |',
  ].join('\n');
  const tree = md.renderMarkdown(doc);
  check('the wrapper owns the horizontal scroll',
    findAll(tree, (node) => node.type === 'div' && node.props.className === 'dsh-tree-table-wrap').length, 1);
  const tables = findAll(tree, (node) => node.type === 'table');
  check('one table is rendered', tables.length, 1);
  const head = findAll(tree, (node) => node.type === 'th');
  check('three header cells', head.length, 3);
  check('the header text survives', head.map((cell) => textOf(cell)).join('|'), 'Option|Cost|Notes');
  check('the row is still a paragraph-free table',
    findAll(tree, (node) => node.type === 'p').length, 0);
  const body = findAll(tree, (node) => node.type === 'td');
  check('six body cells (two rows of three)', body.length, 6);
  // The colons in the delimiter row become alignment, not text.
  check('left column is left aligned', head[0].props.style.textAlign, 'left');
  check('middle column is centred', head[1].props.style.textAlign, 'center');
  check('right column is right aligned', head[2].props.style.textAlign, 'right');
  check('body cells follow the header alignment', body[2].props.style.textAlign, 'right');
}

// --- pipes without a delimiter are prose ---------------------------------
{
  const tree = md.renderMarkdown('a | b | c');
  check('no table is invented', findAll(tree, (node) => node.type === 'table').length, 0);
  check('the line stays a paragraph', findAll(tree, (node) => node.type === 'div').length, 1);
  check('the text is kept', textOf(tree).indexOf('a | b | c') >= 0, true);
}

// --- a table between other blocks ---------------------------------------
{
  const tree = md.renderMarkdown(['### Before', '', '| a | b |', '| --- | --- |', '| 1 | 2 |', '', 'After'].join('\n'));
  check('the heading survives', findAll(tree, (node) => node.type === 'div').length >= 2, true);
  check('the text after the table is still rendered', textOf(tree).indexOf('After') >= 0, true);
  check('one table', findAll(tree, (node) => node.type === 'table').length, 1);
}

console.log(`MARKDOWN TABLE OK — ${checks} checks, GFM tables render with alignment and a scrollable wrapper`);
