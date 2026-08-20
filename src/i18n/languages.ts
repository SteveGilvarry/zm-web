/**
 * Languages the UI can be switched to. Codes are BCP 47. `dir` is the text
 * direction the document takes when the language is active.
 *
 * The list mirrors ZoneMinder's `web/lang/*.php` catalogues so the seeding
 * script (`scripts/i18n-from-zm.mjs`) can pre-fill translations from them;
 * a language appears in the picker only once its catalogue file exists.
 */
export type TextDirection = 'ltr' | 'rtl';

export interface Language {
  code: string;
  /** Name in its own language, as shown in the picker. */
  nativeName: string;
  dir: TextDirection;
  /** ZoneMinder `web/lang/<file>.php` this maps to, for seeding. */
  zmFile?: string;
}

export const LANGUAGES: readonly Language[] = [
  { code: 'en', nativeName: 'English', dir: 'ltr', zmFile: 'en_gb' },
  { code: 'en-US', nativeName: 'English (US)', dir: 'ltr', zmFile: 'en_us' },
  { code: 'cs', nativeName: 'Čeština', dir: 'ltr', zmFile: 'cs_cz' },
  { code: 'da', nativeName: 'Dansk', dir: 'ltr', zmFile: 'dk_dk' },
  { code: 'de', nativeName: 'Deutsch', dir: 'ltr', zmFile: 'de_de' },
  { code: 'es', nativeName: 'Español', dir: 'ltr', zmFile: 'es_es' },
  { code: 'es-AR', nativeName: 'Español (Argentina)', dir: 'ltr', zmFile: 'es_ar' },
  { code: 'es-419', nativeName: 'Español (Latinoamérica)', dir: 'ltr', zmFile: 'es_la' },
  { code: 'et', nativeName: 'Eesti', dir: 'ltr', zmFile: 'et_ee' },
  { code: 'fr', nativeName: 'Français', dir: 'ltr', zmFile: 'fr_fr' },
  { code: 'he', nativeName: 'עברית', dir: 'rtl', zmFile: 'he_il' },
  { code: 'hu', nativeName: 'Magyar', dir: 'ltr', zmFile: 'hu_hu' },
  { code: 'it', nativeName: 'Italiano', dir: 'ltr', zmFile: 'it_it' },
  { code: 'ja', nativeName: '日本語', dir: 'ltr', zmFile: 'ja_jp' },
  { code: 'nl', nativeName: 'Nederlands', dir: 'ltr', zmFile: 'nl_nl' },
  { code: 'nb', nativeName: 'Norsk bokmål', dir: 'ltr', zmFile: 'no_nb' },
  { code: 'pl', nativeName: 'Polski', dir: 'ltr', zmFile: 'pl_pl' },
  { code: 'pt-BR', nativeName: 'Português (Brasil)', dir: 'ltr', zmFile: 'pt_br' },
  { code: 'ro', nativeName: 'Română', dir: 'ltr', zmFile: 'ro_ro' },
  { code: 'ru', nativeName: 'Русский', dir: 'ltr', zmFile: 'ru_ru' },
  { code: 'sv', nativeName: 'Svenska', dir: 'ltr', zmFile: 'se_se' },
  { code: 'tr', nativeName: 'Türkçe', dir: 'ltr', zmFile: 'tr_tr' },
  { code: 'zh-CN', nativeName: '简体中文', dir: 'ltr', zmFile: 'zh_cn' },
  { code: 'zh-TW', nativeName: '繁體中文', dir: 'ltr', zmFile: 'zh_tw' },
  { code: 'bs', nativeName: 'Bosanski', dir: 'ltr', zmFile: 'ba_ba' },
  // Reserved for catalogues that do not exist in ZoneMinder yet:
  { code: 'ar', nativeName: 'العربية', dir: 'rtl' },
  { code: 'fa', nativeName: 'فارسی', dir: 'rtl' },
];

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export function isSupportedLanguage(code: string): code is LanguageCode {
  return LANGUAGES.some((l) => l.code === code || l.code === code.split('-')[0]);
}

export function directionFor(code: string): TextDirection {
  const exact = LANGUAGES.find((l) => l.code === code);
  if (exact) return exact.dir;
  const base = LANGUAGES.find((l) => l.code === code.split('-')[0]);
  return base?.dir ?? 'ltr';
}
