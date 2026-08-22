#!/usr/bin/env node
/**
 * Seed dashboard catalogues from ZoneMinder's own translations.
 *
 *   node scripts/i18n-from-zm.mjs --zm ../ZoneMinder [--langs de,fr,he] [--dry] [--overwrite]
 *
 * ZoneMinder ships `web/lang/<code>.php` files of the form
 *   $SLANG = array( 'AddNewMonitor' => 'Add', 'Monitors' => 'Monitors', … );
 * Our keys are English source text, so for every dashboard key we look up
 * the ZM token whose English (en_gb) value is that text, then take that
 * token's value from each target language.
 *
 * Matching ignores case, surrounding whitespace and trailing `:`/`…`/`?` —
 * ZoneMinder writes "ALARM FRAMES" and "Confirm Password:" where we write
 * "Alarm frames" and "Confirm password", and those are the same string in
 * every language that matters. It does not ignore internal punctuation: a
 * wrong translation is worse than English, and "Delete" is not "Delete all".
 * Exact matches always win over normalised ones.
 *
 * One ZoneMinder quirk is filtered out: a handful of tokens carry an English
 * value that is an abbreviation of what the token means, while the other
 * languages spell the whole thing out — `AddNewMonitor` is 'Add' in English
 * and 'Neuer Monitor' in German. Taking that would put "New monitor" on
 * every generic Add button. Where the token name says materially more than
 * its English value, the entry is skipped.
 *
 * Existing non-empty translations are never overwritten, so hand-corrections
 * survive a reseed. `--overwrite` re-derives every value from ZoneMinder
 * instead: use it when the matching rules change, and only while no human
 * has translated anything — it discards their work otherwise.
 * Writes `src/locales/<code>/translation.json` for each language with at
 * least one hit and prints a coverage table.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) =>
    a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : [],
  ).filter((p) => p.length),
);
const zmDir = resolve(args.zm ?? process.env.ZM_DIR ?? join(repo, '..', 'ZoneMinder'));
const langDir = join(zmDir, 'web', 'lang');
if (!existsSync(langDir)) {
  console.error(`ZoneMinder lang dir not found: ${langDir} (pass --zm <path>)`);
  process.exit(1);
}

/** Parse `$SLANG = array( 'Key' => 'Value', … )` into a Map. Tolerates both quote styles and PHP escapes. */
function parsePhpLang(src) {
  const map = new Map();
  const start = src.indexOf('$SLANG');
  if (start < 0) return map;
  const body = src.slice(start);
  const re = /'((?:[^'\\]|\\.)*)'\s*=>\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
  let m;
  while ((m = re.exec(body))) {
    const key = m[1].replace(/\\(.)/g, '$1');
    const raw = m[2] ?? m[3] ?? '';
    const val = raw.replace(/\\(.)/g, '$1').replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
    if (key && val && !map.has(key)) map.set(key, val);
  }
  return map;
}

// Language table shared with the app (code → zmFile, dir).
const langsSrc = readFileSync(join(repo, 'src/i18n/languages.ts'), 'utf8');
const table = [...langsSrc.matchAll(/code:\s*'([^']+)'[^}]*?zmFile:\s*'([^']+)'/g)].map(([, code, zmFile]) => ({ code, zmFile }));
const wanted = args.langs ? String(args.langs).split(',') : table.map((t) => t.code).filter((c) => c !== 'en');

const en = parsePhpLang(readFileSync(join(langDir, 'en_gb.php'), 'utf8'));
// English text → ZM token (first wins; ZM has a few duplicates like 'Name').
const tokenByEnglish = new Map();
const tokenByNormalised = new Map();
/** Case, surrounding space and trailing `:`/`…`/`?` only. */
const normalise = (s) => s.trim().replace(/[\s:…?]+$/u, '').toLowerCase();
/** `AddNewMonitor` → ['add','new','monitor'] */
const tokenWords = (t) =>
  t.replace(/(?<=[a-z0-9])(?=[A-Z])/gu, ' ').match(/[A-Za-z0-9]+/gu)?.map((w) => w.toLowerCase()) ?? [];
const wordsOf = (s) => s.match(/[A-Za-z0-9]+/gu)?.map((w) => w.toLowerCase()) ?? [];
/** The English value is an abbreviation of the token's meaning. */
const abbreviated = (token, text) => tokenWords(token).length > wordsOf(text).length + 1;

for (const [token, text] of en) {
  if (abbreviated(token, text)) continue;
  if (!tokenByEnglish.has(text)) tokenByEnglish.set(text, token);
  const n = normalise(text);
  if (!tokenByNormalised.has(n)) tokenByNormalised.set(n, token);
}

const enCataloguePath = join(repo, 'src/locales/en/translation.json');
if (!existsSync(enCataloguePath)) {
  console.error('Run `npm run i18n:extract` first — src/locales/en/translation.json is missing.');
  process.exit(1);
}
const ourKeys = Object.keys(JSON.parse(readFileSync(enCataloguePath, 'utf8')));

const rows = [];
for (const code of wanted) {
  const entry = table.find((t) => t.code === code);
  if (!entry) { rows.push([code, '—', 'not in languages.ts']); continue; }
  const file = join(langDir, `${entry.zmFile}.php`);
  if (!existsSync(file)) { rows.push([code, '—', `missing ${entry.zmFile}.php`]); continue; }
  const zm = parsePhpLang(readFileSync(file, 'utf8'));

  const outPath = join(repo, 'src/locales', code, 'translation.json');
  const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : {};
  const out = {};
  let hits = 0;
  for (const key of ourKeys) {
    if (existing[key] && !args.overwrite) { out[key] = existing[key]; continue; }
    const token = tokenByEnglish.get(key) ?? tokenByNormalised.get(normalise(key));
    const translated = token ? zm.get(token) : undefined;
    // Skip untranslated tokens (ZM files often leave English in place).
    if (translated && translated !== key) { out[key] = translated; hits++; }
    // Under --overwrite a rejected match must clear the value, not fall back
    // to what a previous (differently-matched) run left behind.
    else out[key] = args.overwrite ? '' : (existing[key] ?? '');
  }
  const filled = Object.values(out).filter(Boolean).length;
  rows.push([code, `${filled}/${ourKeys.length}`, `+${hits} from ${entry.zmFile}.php`]);
  if (!args.dry && filled > 0) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
  }
}

const w = Math.max(...rows.map((r) => r[0].length));
console.log(`Seeded from ${langDir}\n`);
for (const [code, cov, note] of rows) console.log(`${code.padEnd(w)}  ${cov.padEnd(10)} ${note}`);

const reachable = ourKeys.filter(
  (k) => tokenByEnglish.has(k) || tokenByNormalised.has(normalise(k)),
).length;
console.log(
  `\nCeiling: ${reachable} of ${ourKeys.length} keys (${Math.round((100 * reachable) / ourKeys.length)}%) exist in ` +
  `ZoneMinder's own catalogue at all — it ships ${en.size} strings and this UI has more to say. ` +
  'The rest needs real translators; empty values are what they pick up.',
);
if (args.dry) console.log('\n(dry run — nothing written)');
