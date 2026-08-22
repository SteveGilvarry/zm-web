import { readdirSync } from 'node:fs';

// Extraction config for `npm run i18n:extract` / `npm run i18n:check`.
// Keys are the English source text; the `en` catalogue maps each key to
// itself. Other catalogues keep existing translations and gain new keys
// with an empty value (untranslated → runtime falls back to English).
//
// Catalogue files are sorted and stable so a CI diff (`i18n:check`) shows
// exactly which strings were added or removed by a change.
/**
 * Every catalogue we ship, read from disk rather than listed here so adding
 * `src/locales/<code>/` is all it takes. Extraction rewrites all of them:
 * `en` gets the source text, the rest gain new keys as empty strings and
 * lose keys the code no longer uses. Existing translations are preserved —
 * i18next-parser merges rather than replaces.
 *
 * Before this, only `en` was regenerated, and the other catalogues silently
 * fell 720 keys behind the UI.
 */
const locales = readdirSync('src/locales', { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

export default {
  locales,
  output: 'src/locales/$LOCALE/$NAMESPACE.json',
  input: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/test/**',
    '!src/routeTree.gen.ts',
    '!src/locales/**',
  ],
  defaultNamespace: 'translation',
  keySeparator: false,
  namespaceSeparator: false,
  pluralSeparator: '_',
  contextSeparator: '_',
  // en: key is the text. Other locales: leave empty for translators / the
  // ZoneMinder seeder (scripts/i18n-from-zm.mjs) to fill.
  defaultValue: (locale, _ns, key) => (locale === 'en' ? key : ''),
  keepRemoved: false,
  sort: true,
  indentation: 2,
  lineEnding: 'lf',
  createOldCatalogs: false,
  verbose: false,
  failOnWarnings: false,
  lexers: {
    ts: ['JavascriptLexer'],
    tsx: [
      {
        lexer: 'JsxLexer',
        functions: ['t'],
        componentFunctions: ['Trans'],
        attr: 'i18nKey',
      },
    ],
  },
};
