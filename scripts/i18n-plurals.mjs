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
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'src/locales/en/translation.json';

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
