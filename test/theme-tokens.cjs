/*
 * Theme-token guard.
 *
 * Two jobs:
 *   1. no painted colour may be a literal — every one must resolve through a
 *      DSH token, or the view freezes one theme when the user switches;
 *   2. the inverted-foreground wiring that keeps primary buttons readable in
 *      both themes must stay in place.
 *
 * Exemptions are deliberately narrow:
 *   - `#000` inside maskImage / WebkitMaskImage (an alpha stencil, not paint);
 *   - black-alpha colours that are part of a shadow value (`<x>px <y>px …`).
 *
 * Runs in plain Node: no browser, no DOM, no dependencies.
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'client.js');
const source = fs.readFileSync(file, 'utf8');
const lines = source.split('\n');

// Every alias token the view uses. Each one was checked against DSH's
// design-platform.css for a definition in BOTH the light (`body`) and dark
// (`body[data-ds-dark-theme]`) block; an unknown name here is a typo or a
// token that only exists in one theme.
const ALLOWED_ALIAS_TOKENS = new Set([
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-mask-1',
  '--dsw-alias-border-l1',
  '--dsw-alias-border-l2',
  '--dsw-alias-brand-primary',
  '--dsw-alias-button-primary-fill',
  '--dsw-alias-button-primary-hover',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-primary-foreground',
  '--dsw-alias-label-secondary',
  '--dsw-alias-markdown-code-block',
  '--dsw-alias-state-error-primary',
  '--dsw-alias-state-success-primary',
]);

const HEX_OR_RGB = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
// A colour name is a standalone value: `white-space` and `near-black` are not.
const NAMED_COLOR = /(?<![\w-])(?:white|black|red|green|blue|yellow|orange|purple|pink|brown|gray|grey|silver|maroon|navy|teal|olive|lime|aqua|fuchsia|cyan|magenta)(?![\w-])/gi;
// `color-mix(` is allowed: the tokens it mixes are the paint.
const COLOR_FN = /\b(?:hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
// A shadow value always carries offsets before its colour.
const SHADOW_PREFIX = /\d+px\s+\d+px\s+(?:-?\d+px\s+)?$/;

const violations = [];
lines.forEach((line, index) => {
  const where = `line ${index + 1}`;
  const isComment = /^\s*(\/\/|\*|\/\*)/.test(line);
  const isMask = /maskImage|WebkitMaskImage/.test(line);

  HEX_OR_RGB.lastIndex = 0;
  let match;
  while ((match = HEX_OR_RGB.exec(line)) !== null) {
    const value = match[0];
    if (isMask && /^#0{3,8}$/i.test(value)) continue;
    const blackAlpha = /^rgba?\(\s*0[\s,]+\s*0[\s,]+\s*0[\s,/]/.test(value);
    if (blackAlpha && SHADOW_PREFIX.test(line.slice(0, match.index))) continue;
    violations.push(`${where}: ${value}  <- ${line.trim().slice(0, 110)}`);
  }

  if (isComment) return;
  const named = line.match(NAMED_COLOR);
  if (named) violations.push(`${where}: ${named.join(', ')} (named colour)  <- ${line.trim().slice(0, 110)}`);
  if (COLOR_FN.test(line)) violations.push(`${where}: colour function  <- ${line.trim().slice(0, 110)}`);
});

// Tokens must be known: a typo'd or one-theme-only name silently falls back to
// an invalid value, which is how white-on-white shipped in the first place.
for (const [, token] of source.matchAll(/var\((--dsw-alias-[a-z0-9-]+)/g)) {
  if (!ALLOWED_ALIAS_TOKENS.has(token)) violations.push(`unknown alias token: ${token}`);
}

if (violations.length) {
  console.error('Theme-token violations:');
  for (const violation of [...new Set(violations)]) console.error('  ' + violation);
  process.exit(1);
}

// Per-rule wiring. Asserting on the whole file would let the hover rule
// satisfy a check aimed at the base rule.
const cssBlock = (selector) => {
  const pattern = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{[^}]*\\}');
  const found = source.match(pattern);
  if (!found) throw new Error('CSS rule not found: ' + selector);
  return found[0];
};

const primaryBase = cssBlock('.dsh-tree-btn--primary');
const primaryHover = cssBlock('.dsh-tree-btn--primary:hover:not([disabled])');

const required = [
  [primaryBase.includes('color: var(--dsw-alias-label-primary-foreground)'),
    'primary button label must use --dsw-alias-label-primary-foreground'],
  [primaryBase.includes('background: var(--dsw-alias-button-primary-fill)'),
    'primary button fill must use --dsw-alias-button-primary-fill'],
  [primaryHover.includes('background: var(--dsw-alias-button-primary-hover)'),
    'primary button hover must use --dsw-alias-button-primary-hover'],
  [primaryHover.includes('color: var(--dsw-alias-label-primary-foreground)'),
    'primary button hover label must keep the foreground token'],
  [/onAccent:\s*'var\(--dsw-alias-label-primary-foreground\)'/.test(source),
    'C.onAccent must resolve to the paired foreground token'],
  [/buttonFill:\s*'var\(--dsw-alias-button-primary-fill\)'/.test(source),
    'C.buttonFill must resolve to the primary fill token'],
  [/background: C\.buttonFill, color: C\.onAccent/.test(source),
    'the inline primary button (error reload) must use C.buttonFill + C.onAccent'],
  [/code:\s*'var\(--dsw-alias-markdown-code-block\)'/.test(source),
    'code blocks must use --dsw-alias-markdown-code-block'],
  [/codeInline:\s*'color-mix\(in srgb, var\(--dsw-alias-label-primary\) 7%, transparent\)'/.test(source),
    'inline code must use a label-primary tint so it stays visible on a white card'],
  [/scrim:\s*'var\(--dsw-alias-bg-mask-1\)'/.test(source),
    'the reader backdrop must use --dsw-alias-bg-mask-1'],
  // DSH composes the user's font list with its own default stack on body;
  // reading the composed token keeps glyph fallback intact.
  [/const FONT = 'var\(--dsw-font-family, /.test(source),
    'the text stack must read the composed --dsw-font-family token'],
  [/const MONO = 'var\(--ds-font-family-code, /.test(source),
    'the code stack must read the composed --ds-font-family-code token'],
];

const missing = required.filter(([ok]) => !ok).map(([, message]) => message);
if (missing.length) {
  console.error('Missing theme wiring:');
  for (const message of missing) console.error('  - ' + message);
  process.exit(1);
}

const aliasCount = (source.match(/var\(--dsw-alias-/g) || []).length;
console.log(`THEME OK — ${aliasCount} alias-token references, ${ALLOWED_ALIAS_TOKENS.size} allowed tokens, no hardcoded paint colours`);
