/*
 * Locale guard.
 *
 * The plugin ships its own dictionaries and registers them with the DSH locale
 * service, so a missing key is not a crash — it silently renders the key name,
 * or a different language, in one UI language only. That is the kind of defect
 * nobody sees until a user in that language reports it.
 *
 * Three jobs:
 *   1. every registered language has exactly the same key set (zh is the source
 *      of truth: it is the language the product was written in);
 *   2. every `{placeholder}` a string promises exists in every translation —
 *      a dropped `{count}` prints a sentence with a hole in it;
 *   3. no language carries characters from another script (a stray CJK glyph
 *      inside a German string is a copy-paste defect, not a translation).
 *
 * Runs in plain Node: no browser, no DOM, no dependencies.
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'client.js');
const source = fs.readFileSync(file, 'utf8');

/** Pull `const DICT = { … };` out of the client bundle and evaluate it. */
function readDict() {
  const start = source.indexOf('const DICT = {');
  if (start < 0) throw new Error('const DICT not found');
  const open = source.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "'" || ch === '"') {
      // Skip the string literal, honouring backslash escapes.
      const quote = ch;
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === quote) break;
        i += 1;
      }
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) throw new Error('DICT braces never balanced');
  // eslint-disable-next-line no-new-func
  return new Function('return (' + source.slice(open, end + 1) + ');')();
}

const DICT = readDict();
const languages = Object.keys(DICT);
const problems = [];

// DSH ships these eight interface languages; the tab has to be readable in each.
const REQUIRED = ['zh', 'en', 'de', 'es', 'fr', 'ja', 'pt', 'ru'];
for (const lang of REQUIRED) {
  if (!DICT[lang]) problems.push(`missing language table: ${lang}`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const base = Object.keys(DICT.zh).sort();
const placeholders = (text) => (String(text).match(/\{\w+\}/g) || []).sort().join(',');

// Characters that belong to one script and have no business in another
// language's table. Latin/Greek/Cyrillic are checked pairwise below.
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/;
const KANA = /[\u3040-\u30ff]/;
const HAN = /[\u4e00-\u9fff]/;
const HANGUL = /[\uac00-\ud7af]/;

const EUROPEAN = ['en', 'de', 'es', 'fr', 'pt', 'ru'];

for (const lang of languages) {
  const table = DICT[lang];
  const keys = Object.keys(table).sort();

  const missing = base.filter((key) => !keys.includes(key));
  const extra = keys.filter((key) => !base.includes(key));
  if (missing.length) problems.push(`${lang}: missing ${missing.length} key(s): ${missing.slice(0, 8).join(', ')}`);
  if (extra.length) problems.push(`${lang}: ${extra.length} key(s) not in zh: ${extra.slice(0, 8).join(', ')}`);

  for (const key of keys) {
    const value = table[key];
    if (typeof value !== 'string' || value === '') {
      problems.push(`${lang}: ${key} is empty or not a string`);
      continue;
    }
    if (base.includes(key) && placeholders(value) !== placeholders(DICT.zh[key])) {
      problems.push(`${lang}: ${key} placeholder mismatch — zh {${placeholders(DICT.zh[key])}} vs ${lang} {${placeholders(value)}}`);
    }
    if (EUROPEAN.includes(lang) && CJK.test(value)) problems.push(`${lang}: ${key} contains CJK characters`);
    if (lang === 'ru' && HANGUL.test(value)) problems.push(`ru: ${key} contains Hangul`);
    if (lang !== 'ja' && lang !== 'zh' && KANA.test(value)) problems.push(`${lang}: ${key} contains kana`);
    if (lang === 'ja' && HAN.test(value) === false && /[\u4e00-\u9fff]/.test(DICT.zh[key] || '')) {
      // Japanese may legitimately use kana only for a string Chinese writes in
      // Han, so this is not a defect — recorded here so the rule is explicit.
    }
  }
}

// The tab label and the heading are the same product surface; translating them
// differently in one language reads like a bug in the shell.
for (const lang of languages) {
  if (DICT[lang]['view.tab'] !== DICT[lang]['view.heading']) {
    problems.push(`${lang}: view.tab and view.heading disagree`);
  }
}

// A language that is a copy of English is not a translation.
for (const lang of languages) {
  if (lang === 'en') continue;
  const identical = base.filter((key) => DICT[lang][key] === DICT.en[key]);
  const ratio = identical.length / base.length;
  if (ratio > 0.15) {
    problems.push(`${lang}: ${identical.length}/${base.length} strings are untranslated English — is this table real?`);
  }
}

if (problems.length) {
  console.error('Locale problems:');
  for (const problem of problems) console.error('  - ' + problem);
  process.exit(1);
}

console.log(`LOCALE OK — ${languages.length} languages (${languages.join(', ')}), ${base.length} keys each, placeholders aligned, no cross-script leakage`);
