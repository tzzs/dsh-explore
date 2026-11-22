/*
 * Slash commands and skill calls read as calls, not as prose.
 *
 * A prompt that opens with `/poteto-mode …` is how a skill is invoked, and the
 * host renders that token as a chip in sent text. The canvas used to draw it as
 * plain text, so the one thing that said "this row invoked a skill" was the only
 * thing the card did not show.
 *
 * The token shape is the host's own: `skillReferenceRule` matches a `/name` run
 * with whitespace on both sides. The same boundary discipline is asserted here,
 * because a looser rule would chip `/usr/bin`, `and/or` and every URL path.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');

const start = source.indexOf('    /** Only these schemes may become a live link. */');
const end = source.indexOf('    /** Whether a line is a GFM table delimiter row', start);
assert.ok(start > 0 && end > start, 'the inline renderer must exist');

const h = (type, props, ...children) => ({
  type,
  props: props || {},
  children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false),
});
const factory = new Function('h', 'MD', source.slice(start, end)
  + '\nreturn { inlineNodes, commandTextNodes, commandChip, SLASH_COMMAND };');
const md = factory(h, {});

let checks = 0;
function check(label, actual, expected) {
  assert.deepEqual(actual, expected, label);
  checks += 1;
}

/** One rendered node as `chip:/name` or its literal text. */
function shape(nodes) {
  return nodes.map((node) => {
    if (typeof node === 'string') return node;
    if (node && node.props && node.props.className === 'dsh-tree-command') return 'chip:' + node.children.join('');
    return String(node && node.type);
  });
}

// A leading command and a command after whitespace are both calls.
check('leading call', shape(md.commandTextNodes('/poteto-mode 给当前的内存占用增加 treemap', 'k')),
  ['chip:/poteto-mode', ' 给当前的内存占用增加 treemap']);
check('mid-sentence call', shape(md.commandTextNodes('先运行 /goal 再继续', 'k')),
  ['先运行 ', 'chip:/goal', ' 再继续']);
check('trailing call', shape(md.commandTextNodes('done /compact', 'k')),
  ['done ', 'chip:/compact']);

// Word boundaries: a slash inside a word, a path, or bare punctuation is text.
check('path is text', shape(md.commandTextNodes('/usr/bin/env node', 'k')), ['/usr/bin/env node']);
check('word join is text', shape(md.commandTextNodes('and/or', 'k')), ['and/or']);
check('bare slash is text', shape(md.commandTextNodes('a / b', 'k')), ['a / b']);
check('empty stays empty', shape(md.commandTextNodes('', 'k')), ['']);
check('plain text is untouched', shape(md.commandTextNodes('没有命令的一句话', 'k')), ['没有命令的一句话']);

// The markdown path uses the same rule, and a code span keeps its literal text.
check('inline call', shape(md.inlineNodes('/poteto-mode 检查', 'i')),
  ['chip:/poteto-mode', ' 检查']);
check('code span keeps the token', shape(md.inlineNodes('`/poteto-mode`', 'i')), ['code']);
const code = md.inlineNodes('`/poteto-mode`', 'i')[0];
check('code span text', code.children.join(''), '/poteto-mode');
check('emphasis inner call', shape(md.inlineNodes('**/goal**', 'i')), ['strong']);

// Bound the regex itself: greedy name runs stop at the first non-word character.
check('regex name', md.SLASH_COMMAND.exec('/poteto-mode rest')[1], 'poteto-mode');
check('regex rejects a path', md.SLASH_COMMAND.exec('/usr/bin'), null);

// The stylesheet carries the host's reference-chip treatment and the composer
// contract the layout fix depends on.
const styleStart = source.indexOf('style.textContent = [');
const styleEnd = source.indexOf("].join('\\n');", styleStart);
const sheet = source.slice(styleStart, styleEnd);
assert.match(sheet, /\.dsh-tree-command \{[^}]*var\(--dsw-alias-state-business-primary\)/,
  'the chip paints with the business accent');
assert.match(sheet, /\.dsh-tree-command \{[^}]*var\(--dsw-radius-sm/, 'the chip takes the shared small radius');
checks += 2;

console.log('SLASH COMMAND OK — ' + checks + ' checks, boundary-bounded chips in text and markdown');
