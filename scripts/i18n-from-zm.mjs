#!/usr/bin/env node
/**
 * Seed dashboard catalogues from ZoneMinder's own translations.
 *
 *   node scripts/i18n-from-zm.mjs --zm ../ZoneMinder [--langs de,fr,he] [--dry]
 *
 * ZoneMinder ships `web/lang/<code>.php` files of the form
 *   $SLANG = array( 'AddNewMonitor' => 'Add', 'Monitors' => 'Monitors', … );
 * Our keys are English source text, so for every dashboard key we look up
 * the ZM token whose English (en_gb) value is that exact text, then take
 * that token's value from each target language. Only exact, case-sensitive
 * matches are used — a wrong translation is worse than English.
 *
 * Existing non-empty translations in our catalogues are never overwritten.
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
for (const [token, text] of en) if (!tokenByEnglish.has(text)) tokenByEnglish.set(text, token);

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
    if (existing[key]) { out[key] = existing[key]; continue; }
    const token = tokenByEnglish.get(key);
    const translated = token ? zm.get(token) : undefined;
    // Skip untranslated tokens (ZM files often leave English in place).
    if (translated && translated !== key) { out[key] = translated; hits++; }
    else out[key] = existing[key] ?? '';
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
if (args.dry) console.log('\n(dry run — nothing written)');
