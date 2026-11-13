/*
 * Theme-token guard: every painted colour in client.js must come from a DSH
 * alias token, or the view freezes one theme when the user switches light/dark.
 *
 * Two colour literals are deliberately allowed:
 *   - `#000` in mask gradients (an alpha stencil, not paint),
 *   - black-alpha `rgb()/rgba()` inside box shadows (decorative; invisible in
 *     dark mode by design, and DSH's own shadows are black-alpha too).
 *
 * Runs in plain Node, no browser and no DOM.
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'client.js');
const source = fs.readFileSync(file, 'utf8');
const lines = source.split('\n');
const literal = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;

const violations = [];
lines.forEach((line, index) => {
  const matches = line.match(literal);
  if (!matches) return;
  // A multi-line ternary can put the `boxShadow:` key a few lines above the
  // string that carries the shadow colour, so look at the enclosing statement.
  const statement = lines.slice(Math.max(0, index - 4), index + 1).join('\n');
  const blackAlpha = matches.every((m) => /^rgba?\(0,\s*0,\s*0,/.test(m));
  const isMask = /maskImage|WebkitMaskImage/.test(line) && matches.every((m) => m === '#000');
  const isShadow = /boxShadow/.test(statement) && blackAlpha;
  if (!isMask && !isShadow) {
    violations.push(`  line ${index + 1}: ${matches.join(', ')}  <- ${line.trim().slice(0, 110)}`);
  }
});

if (violations.length) {
  console.error('Hardcoded paint colours found; use var(--dsw-alias-*) instead:');
  for (const v of violations) console.error(v);
  process.exit(1);
}

// The primary button sits on an inverted token (near-black in light,
// near-white in dark), so its text must use the paired foreground token.
const required = [
  [/\.dsh-tree-btn--primary[\s\S]{0,240}color: var\(--dsw-alias-label-primary-foreground\)/,
    'primary button must use --dsw-alias-label-primary-foreground for its label (not #fff)'],
  [/onAccent:\s*'var\(--dsw-alias-label-primary-foreground\)'/,
    'C.onAccent must resolve to the paired foreground token'],
  [/code:\s*'var\(--dsw-alias-markdown-code-block\)'/,
    'code blocks must use --dsw-alias-markdown-code-block'],
  [/codeInline:\s*'var\(--dsw-alias-markdown-inline-code\)'/,
    'inline code must use --dsw-alias-markdown-inline-code'],
  [/scrim:\s*'var\(--dsw-alias-bg-mask-1\)'/,
    'the reader backdrop must use --dsw-alias-bg-mask-1'],
  [/const FONT = 'var\(--dsh-font-family-text,/,
    'the text stack must follow --dsh-font-family-text'],
  [/const MONO = 'var\(--dsh-font-family-code,/,
    'the code stack must follow --dsh-font-family-code'],
];

const missing = required.filter(([re]) => !re.test(source)).map(([, message]) => message);
if (missing.length) {
  console.error('Missing theme wiring:');
  for (const m of missing) console.error('  - ' + m);
  process.exit(1);
}

const aliasCount = (source.match(/var\(--dsw-alias-/g) || []).length;
console.log(`THEME OK — ${aliasCount} alias-token references, no hardcoded paint colours`);
