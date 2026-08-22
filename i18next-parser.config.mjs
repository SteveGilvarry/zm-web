// Extraction config for `npm run i18n:extract` / `npm run i18n:check`.
// Keys are the English source text; the `en` catalogue maps each key to
// itself. Other catalogues keep existing translations and gain new keys
// with an empty value (untranslated → runtime falls back to English).
//
// Catalogue files are sorted and stable so a CI diff (`i18n:check`) shows
// exactly which strings were added or removed by a change.
export default {
  locales: ['en'],
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
