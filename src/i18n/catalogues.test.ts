import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LANGUAGES } from './languages';

/**
 * Guards on the catalogues themselves.
 *
 * A translator works in JSON (or, one day, a web UI writing this JSON), and
 * the two mistakes that actually break the running app are dropping an
 * interpolation and dropping a <Trans> element index — `{{count}} events`
 * translated without `{{count}}` renders a sentence with a hole in it, and a
 * missing `<2>…</2>` throws away the link inside it. Both are silent at
 * build time, so they are asserted here.
 */

const LOCALES_DIR = 'src/locales';
const locales = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const read = (code: string): Record<string, string> =>
  JSON.parse(readFileSync(join(LOCALES_DIR, code, 'translation.json'), 'utf8'));

/** `{{count}}` interpolations and `<2>` element indices, order-insensitive. */
function placeholders(text: string): string[] {
  const interpolations = text.match(/\{\{[^}]+\}\}/g) ?? [];
  const elements = text.match(/<\/?\d+>/g) ?? [];
  return [...interpolations, ...elements].sort();
}

describe('translation catalogues', () => {
  const en = read('en');

  it('can serve every language the picker offers', () => {
    // A regional code without its own catalogue is fine — i18next falls back
    // to the base language, which is how en-US gets English. A code with
    // neither is a language we offer and cannot render.
    const unservable = LANGUAGES.map((l) => l.code).filter(
      (code) => !locales.includes(code) && !locales.includes(code.split('-')[0]),
    );
    expect(unservable).toEqual([]);
  });

  it('maps every English key to its own text', () => {
    const wrong = Object.entries(en).filter(([k, v]) => k !== v && !k.includes('_'));
    expect(wrong).toEqual([]);
  });

  /**
   * `{{count}} zone deleted_few` → `{{count}} zone deleted`. Czech needs
   * one/few/many/other where English needs one/other, so a locale legitimately
   * carries more keys than `en`; what must match is the set of base strings.
   */
  const base = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/u, '');
  const baseKeys = (cat: Record<string, string>) => new Set(Object.keys(cat).map(base));

  /**
   * Which plural forms a language has is a property of the language. i18next
   * picks the form with `Intl.PluralRules`, so a category the language does
   * not have is never looked up: it bloats the file and asks a translator for
   * a string that can never render. `scripts/i18n-plurals.mjs` aligns them
   * after extraction; this is the guard that it ran.
   */
  it.each(locales)('%s carries exactly its CLDR plural categories', (code) => {
    const expected = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
    const present = new Set<string>();
    for (const key of Object.keys(read(code))) {
      const match = /_(zero|one|two|few|many|other)$/u.exec(key);
      if (match) present.add(match[1]);
    }
    expect([...present].sort()).toEqual([...expected].sort());
  });

  it.each(locales.filter((l) => l !== 'en'))('%s covers every string in en', (code) => {
    const theirs = baseKeys(read(code));
    const missing = [...baseKeys(en)].filter((k) => !theirs.has(k));
    const extra = [...theirs].filter((k) => !baseKeys(en).has(k));
    // `npm run i18n:extract` rewrites every catalogue; drift means it was not
    // run, and a translator would be working from a stale list.
    expect({ missing: missing.slice(0, 5), extra: extra.slice(0, 5) })
      .toEqual({ missing: [], extra: [] });
  });

  it.each(locales.filter((l) => l !== 'en'))('%s keeps every placeholder', (code) => {
    const broken = Object.entries(read(code))
      .filter(([key, value]) => value && placeholders(key).join() !== placeholders(value).join())
      .map(([key, value]) => `${key} -> ${value}`);
    expect(broken).toEqual([]);
  });

  it.each(locales.filter((l) => l !== 'en'))('%s leaves untranslated strings empty, never null', (code) => {
    const wrongType = Object.entries(read(code)).filter(([, v]) => typeof v !== 'string');
    expect(wrongType).toEqual([]);
  });
});
