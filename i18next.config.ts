import { readdirSync } from 'node:fs';
import { defineConfig, type ExtractedKey } from 'i18next-cli';

// Extraction config for `npm run i18n:extract` / `npm run i18n:check`.
// Keys are the English source text; the `en` catalogue maps each key to
// itself. Other catalogues keep existing translations and gain new keys
// with an empty value (untranslated → runtime falls back to English).
//
// Catalogue files are sorted and stable so a CI diff (`i18n:check`) shows
// exactly which strings were added or removed by a change.
//
// Every catalogue we ship is read from disk rather than listed here, so
// adding `src/locales/<code>/` is all it takes. Extraction rewrites all of
// them: `en` gets the source text, the rest gain new keys as empty strings
// and lose keys the code no longer uses. Existing translations are kept.
const locales = readdirSync('src/locales', { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

// The order i18next-parser wrote the catalogues in, kept so the switch of
// tool did not reorder 2,500 keys in 26 files: plural forms of one key sit
// together in CLDR order, everything else by English collation.
const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const PLURAL_RE = /_(?:zero|one|two|few|many|other)$/;
const suffixPosition = (key: string) => PLURAL_SUFFIXES.findIndex((s) => key.endsWith(`_${s}`));
function legacyOrder(a: ExtractedKey, b: ExtractedKey): number {
  const sa = a.key.replace(PLURAL_RE, '');
  const sb = b.key.replace(PLURAL_RE, '');
  if (sa === sb) return suffixPosition(a.key) - suffixPosition(b.key);
  return sa.localeCompare(sb, 'en');
}

export default defineConfig({
  locales,
  extract: {
    input: ['src/**/*.{ts,tsx}'],
    // Tests carry strings of their own; the generated route tree and the
    // catalogues themselves are not source.
    ignore: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/routeTree.gen.ts', 'src/locales/**'],
    output: 'src/locales/{{language}}/{{namespace}}.json',
    defaultNS: 'translation',
    keySeparator: false,
    nsSeparator: false,
    pluralSeparator: '_',
    contextSeparator: '_',
    functions: ['t', '*.t'],
    transComponents: ['Trans'],
    primaryLanguage: 'en',
    // en: key is the text. Other locales: leave empty for translators / the
    // ZoneMinder seeder (scripts/i18n-from-zm.mjs) to fill.
    defaultValue: (key, _ns, language) => (language === 'en' ? key : ''),
    removeUnusedKeys: true,
    sort: legacyOrder,
    indentation: 2,
  },
});
