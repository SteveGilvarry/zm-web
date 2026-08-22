#!/usr/bin/env node
/**
 * Fill English plural forms in src/locales/en/translation.json.
 *
 * Keys are English text; `npm run i18n:extract` emits `key_one` and
 * `key_other` for every `t('…{{count}}…', { count })` call with the key text
 * as the value of both — so "4 vertex" would render in English until
 * someone hand-edits `_other`. This script does that edit deterministically:
 * the noun right after `{{count}}` (or right before it, for "Total ({{count}}
 * monitor)") is singularised for `_one` and pluralised for `_other` using the
 * dictionary below. Words not in the dictionary are left alone and listed, so
 * a new plural key is a one-line addition here, reviewed in the PR.
 *
 * Runs after extraction (`npm run i18n:extract` calls it). Idempotent; never
 * touches values a human has already changed away from the key text.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const FILE = 'src/locales/en/translation.json';
const DIR = 'src/locales';
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** singular → plural. Add here when the script reports an unknown noun. */
const PLURALS = {
  monitor: 'monitors', event: 'events', change: 'changes', vertex: 'vertices',
  'sub-group': 'sub-groups', slot: 'slots', cell: 'cells', row: 'rows',
  column: 'columns', packet: 'packets', config: 'configs', filter: 'filters',
  zone: 'zones', group: 'groups', user: 'users', server: 'servers', log: 'logs',
  frame: 'frames', tag: 'tags', preset: 'presets', layout: 'layouts',
  report: 'reports', daemon: 'daemons', result: 'results', match: 'matches',
  file: 'files', second: 'seconds', minute: 'minutes', hour: 'hours', day: 'days',
  item: 'items', entry: 'entries', page: 'pages', camera: 'cameras', retry: 'retries', control: 'controls', setting: 'settings',
};
const SINGULARS = Object.fromEntries(Object.entries(PLURALS).map(([s, p]) => [p, s]));

/** Words after {{count}} that are not the noun: adjectives to look past… */
const ADJECTIVES = new Set(['unsaved', 'pending', 'matching', 'new', 'other', 'open', 'archived', 'active', 'enabled', 'disabled']);
/** …and tails where the count has no noun to inflect (same text both forms). */
const NO_NOUN = new Set(['more', 'active', 'min', 'selected', 'stopped', 'total', 'ago', 'h', 'm', 's', 'fps', 'remaining', 'listed', 'shown', 'matching', 'pending', 'live', 'invalid', 'of']);

// "{{count}} monitor", "{{count}} unsaved change", "Total ({{count}} monitor)", "…and {{count}} more not shown"
const AFTER = /\{\{count\}\}\s+([a-z][a-z-]*)(?:\s+([a-z][a-z-]*))?/;

function reword(text, toPlural) {
  const m = AFTER.exec(text);
  if (!m) return { text, noun: null, known: true };
  let noun = m[1];
  if (ADJECTIVES.has(noun) && m[2]) noun = m[2];
  if (NO_NOUN.has(noun)) return { text, noun, known: true };
  const table = toPlural ? PLURALS : SINGULARS;
  if (toPlural && SINGULARS[noun]) return { text, noun, known: true }; // already plural
  if (!toPlural && PLURALS[noun]) return { text, noun, known: true }; // already singular
  const repl = table[noun];
  if (!repl) return { text, noun, known: false };
  return { text: text.replace(new RegExp(`\\b${noun}\\b`), repl), noun, known: true };
}

const cat = JSON.parse(readFileSync(FILE, 'utf8'));
const unknown = new Set();
let changed = 0;
for (const key of Object.keys(cat)) {
  const isOne = key.endsWith('_one');
  const isOther = key.endsWith('_other');
  if (!isOne && !isOther) continue;
  const base = key.replace(/_(one|other)$/, '');
  if (cat[key] !== base) continue; // a human already edited it
  const { text, noun, known } = reword(base, isOther);
  if (!known) unknown.add(noun);
  if (text !== cat[key]) { cat[key] = text; changed++; }
}
writeFileSync(FILE, JSON.stringify(cat, null, 2) + '\n');
console.log(`i18n-plurals: ${changed} plural form(s) filled`);
if (unknown.size) {
  console.log(`i18n-plurals: nouns not in the dictionary (add to scripts/i18n-plurals.mjs): ${[...unknown].join(', ')}`);
}

/**
 * Give every catalogue exactly the plural categories its language has.
 *
 * A plural key is `<text>_<category>`, and which categories exist is a
 * property of the language, not of English: Japanese has only `other`,
 * Czech has `one/few/many/other`, Arabic has all six. i18next resolves the
 * category with `Intl.PluralRules`, so a form the language does not have is
 * never looked up — it is dead weight in the file and, worse, a string a
 * translator is asked to translate that can never render.
 *
 * The catalogues were first written with English's `one`/`other` everywhere,
 * which left Japanese and both Chinese variants carrying a `_one` nobody can
 * use. Extraction does not correct that by itself, so this pass does: drop
 * categories the language lacks, add ones it has (empty → untranslated).
 * Idempotent, and it is what a translation platform reading i18next JSON v4
 * would generate, so the files stay importable without a reformat.
 */
let pruned = 0;
let added = 0;
for (const locale of readdirSync(DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()) {
  const file = `${DIR}/${locale}/translation.json`;
  const entries = JSON.parse(readFileSync(file, 'utf8'));
  const categories = new Set(new Intl.PluralRules(locale).resolvedOptions().pluralCategories);

  // Group by base text so a key is only treated as plural when it has at
  // least one sibling form — an ordinary key that happens to end in `_one`
  // must not be mistaken for one.
  const forms = new Map();
  for (const key of Object.keys(entries)) {
    const match = PLURAL_SUFFIX.exec(key);
    if (!match) continue;
    const base = key.slice(0, -match[0].length);
    if (!forms.has(base)) forms.set(base, new Set());
    forms.get(base).add(match[1]);
  }

  const drop = new Set();
  const insert = new Map();
  for (const [base, present] of forms) {
    // One lone form in a category the language does not have is far more
    // likely an ordinary key ending in `_one` than a broken plural.
    if (present.size < 2 && !categories.has([...present][0])) continue;
    for (const category of present) {
      if (!categories.has(category)) drop.add(`${base}_${category}`);
    }
    for (const category of categories) {
      if (!present.has(category)) {
        if (!insert.has(base)) insert.set(base, []);
        insert.get(base).push(category);
      }
    }
  }
  if (!drop.size && !insert.size) continue;

  // Rebuild in the order the extractor wrote, keeping new forms beside their
  // siblings: the extractor sorts with a collator, and re-sorting here with
  // JS default order would rewrite every catalogue line as a false diff.
  const out = {};
  for (const [key, value] of Object.entries(entries)) {
    if (drop.has(key)) { pruned++; continue; }
    out[key] = value;
    const match = PLURAL_SUFFIX.exec(key);
    if (!match) continue;
    const base = key.slice(0, -match[0].length);
    const pending = insert.get(base);
    // Attach after the last surviving sibling, so the group stays together.
    if (!pending || [...forms.get(base)].some((c) => categories.has(c)
      && `${base}_${c}` !== key && !drop.has(`${base}_${c}`)
      && Object.keys(entries).indexOf(`${base}_${c}`) > Object.keys(entries).indexOf(key))) continue;
    for (const category of pending) { out[`${base}_${category}`] = locale === 'en' ? base : ''; added++; }
    insert.delete(base);
  }
  writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
}
if (pruned || added) {
  console.log(`i18n-plurals: plural categories aligned to CLDR (${pruned} removed, ${added} added)`);
}
