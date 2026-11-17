/*
 * What the Markdown renderer covers.
 *
 * The view renders answers and reasoning with a small renderer of its own (no
 * dependencies, one file), so "does it support Markdown" has no library
 * documentation to point at. This file is that documentation, executable: one
 * block per construct the renderer claims, plus the ones it deliberately leaves
 * as text.
 *
 * The deliberate omissions are asserted too. A model that emits a footnote or a
 * reference link must get readable text — not a half-rendered fragment — so the
 * "not supported" cases are part of the contract rather than an accident.
 *
 * Runs in plain Node: no browser, no DOM, no dependencies.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');

const start = source.indexOf('    /** Only these schemes may become a live link. */');
const end = source.indexOf('    /** Whether a line is a GFM table delimiter row', start);
assert.ok(start > 0 && end > start, 'the markdown renderer must exist');

const h = (type, props, ...children) => ({
  type,
  props: props || {},
  children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false),
});
const MD = {};
const factory = new Function('h', 'MD', source.slice(start, end) + '\nreturn { renderMarkdown, inlineNodes, safeHref };');
const md = factory(h, MD);

let checks = 0;
function check(label, actual, expected) {
  assert.deepEqual(actual, expected, label);
  checks += 1;
}
function truthy(label, value) {
  assert.ok(value, label);
  checks += 1;
}

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
const types = (tree) => findAll(tree, (node) => typeof node.type === 'string').map((node) => node.type);
const render = (markdown) => md.renderMarkdown(markdown);

// ---------------------------------------------------------------- headings
{
  for (const level of [1, 2, 3, 4, 5, 6]) {
    const tree = render('#'.repeat(level) + ' Title');
    check(`${'#'.repeat(level)} is an h${level}`, types(tree), ['h' + level]);
  }
  check('a heading keeps its text', textOf(render('## Hello')), 'Hello');
  check('a closing run of hashes is not text', textOf(render('## Hello ##')), 'Hello');
  check('setext "===" is an h1', types(render('Title\n=====')), ['h1']);
  check('setext "---" is an h2', types(render('Title\n-----')), ['h2']);
}

// ------------------------------------------------------------------- blocks
check('a blank-line separated block is a paragraph', types(render('one\n\ntwo')), ['p', 'p']);
check('a rule is an hr', types(render('a\n\n***\n\nb')), ['p', 'hr', 'p']);
check('a fence is a pre with a language label',
  types(render('```js\nconst a = 1;\n```')), ['div', 'div', 'pre']);
check('a tilde fence works too', types(render('~~~\ncode\n~~~')), ['div', 'pre']);
check('an info string becomes the label',
  textOf(render('```ts title=x\nlet a;\n```')), 'tslet a;');
check('a fence keeps its content verbatim',
  textOf(render('```\n  indented\n  *not em*\n```')).indexOf('  *not em*') >= 0, true);
check('a quote is a blockquote', types(render('> quoted')), ['blockquote', 'p']);
check('a list inside a quote still renders', types(render('> - a\n> - b')), ['blockquote', 'ul', 'li', 'li']);

// -------------------------------------------------------------------- lists
check('an unordered list', types(render('- a\n- b')), ['ul', 'li', 'li']);
check('an ordered list', types(render('1. a\n2. b')), ['ol', 'li', 'li']);
{
  const tree = render('3. a\n4. b');
  check('an ordered list keeps its start number', tree[0].props.start, 3);
}
{
  const tree = render('- a\n  - b\n- c');
  check('a nested list', types(tree), ['ul', 'li', 'ul', 'li', 'li']);
  check('the nested item text', textOf(tree[0].children[0]), 'ab');
}
{
  const tree = render('- [ ] todo\n- [x] done');
  const boxes = findAll(tree, (node) => node.type === 'input');
  check('task list checkboxes', boxes.length, 2);
  check('an unfinished task is unchecked', boxes[0].props.checked, false);
  check('a finished task is checked', boxes[1].props.checked, true);
  check('the task text survives without the marker', textOf(tree[0]).indexOf('[ ]'), -1);
}

// ------------------------------------------------------------------- inline
check('bold', types(md.inlineNodes('a **b** c', 'k')), ['strong']);
check('bold with underscores', types(md.inlineNodes('a __b__ c', 'k')), ['strong']);
check('italic', types(md.inlineNodes('a *b* c', 'k')), ['em']);
check('italic with underscores', types(md.inlineNodes('a _b_ c', 'k')), ['em']);
check('strikethrough', types(md.inlineNodes('a ~~b~~ c', 'k')), ['del']);
check('inline code', types(md.inlineNodes('use `x` here', 'k')), ['code']);
check('a double backtick span can hold a backtick',
  textOf(md.inlineNodes('``a ` b``', 'k')), 'a ` b');
check('emphasis nests inside strong',
  types(md.inlineNodes('**a *b* c**', 'k')), ['strong', 'em']);
check('code is not styled inside inline code', types(md.inlineNodes('`**x**`', 'k')), ['code']);
{
  const nodes = md.inlineNodes('\\*not em\\*', 'k');
  check('a backslash escape wins over emphasis', textOf(nodes), '*not em*');
  check('an escape produces no element', types(nodes), []);
}
{
  const nodes = md.inlineNodes('one  \ntwo', 'k');
  check('two trailing spaces are a hard break', types(nodes), ['br']);
}
{
  const nodes = md.inlineNodes('one\\\ntwo', 'k');
  check('a trailing backslash is a hard break', types(nodes), ['br']);
}
check('a soft newline becomes a space', textOf(md.inlineNodes('one\ntwo', 'k')), 'one two');

// -------------------------------------------------------------------- links
{
  const link = md.inlineNodes('[label](https://example.com)', 'k')[0];
  check('a link keeps its href', link.props.href, 'https://example.com');
  check('a link opens in a new tab', link.props.target, '_blank');
  check('a link is marked noreferrer', link.props.rel, 'noreferrer noopener');
  check('a link keeps its label', textOf(link), 'label');
}
check('a link title', md.inlineNodes('[l](https://e.com "T")', 'k')[0].props.title, 'T');
check('an autolink', md.inlineNodes('<https://e.com>', 'k')[0].props.href, 'https://e.com');
check('a bare URL becomes a link',
  findAll(md.inlineNodes('see https://e.com/x.', 'k'), (node) => node.type === 'a')[0].props.href,
  'https://e.com/x');
check('a mailto link', md.inlineNodes('<mailto:a@b.c>', 'k')[0].props.href, 'mailto:a@b.c');

// ---------------------------------------------------------------- URL safety
check('javascript: is refused', md.safeHref('javascript:alert(1)'), null);
check('data: is refused', md.safeHref('data:text/html,<script>'), null);
check('vbscript: is refused', md.safeHref('VBScript:msgbox'), null);
check('https is allowed', md.safeHref('https://e.com'), 'https://e.com');
check('mailto is allowed', md.safeHref('mailto:a@b.c'), 'mailto:a@b.c');
check('a fragment is allowed', md.safeHref('#section'), '#section');
{
  const nodes = md.inlineNodes('[danger](javascript:alert(1))', 'k');
  check('a refused scheme renders as text, not a link', types(nodes), []);
  check('the refused link keeps its label', textOf(nodes), 'danger');
}

// ------------------------------------------------------------------- images
{
  const image = md.inlineNodes('![alt text](https://e.com/a.png)', 'k')[0];
  check('an image is an img', image.type, 'img');
  check('an image keeps alt text', image.props.alt, 'alt text');
  check('an image is lazy', image.props.loading, 'lazy');
}
check('an unsafe image source renders as alt text',
  textOf(md.inlineNodes('![x](javascript:alert(1))', 'k')), 'x');

// ------------------------------------------------------- deliberate omissions
// These must degrade to readable text, never to a broken fragment.
check('a reference link stays text',
  textOf(md.inlineNodes('[label][ref]', 'k')), '[label][ref]');
check('a footnote marker stays text', textOf(render('a[^1]')), 'a[^1]');
check('raw HTML is text, never an element', types(md.inlineNodes('<script>x</script>', 'k')), []);
check('raw HTML keeps its characters',
  textOf(md.inlineNodes('<b>bold</b>', 'k')), '<b>bold</b>');
check('an unclosed fence still renders', types(render('```\nunclosed')), ['div', 'pre']);

console.log(`MARKDOWN OK — ${checks} checks across headings, blocks, lists, inline, links, images and refusals`);
