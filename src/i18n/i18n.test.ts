import { describe, expect, it } from 'vitest';
import i18next from 'i18next';
import i18n, { changeLanguage, isSupportedLanguage, setupI18n } from './index';
import { applyDirection } from './direction';
import { LANGUAGES, directionFor } from './languages';

describe('i18n', () => {
  it('returns the English key when no catalogue is loaded', async () => {
    await changeLanguage('en');
    expect(i18n.t('Add monitor')).toBe('Add monitor');
    expect(i18n.t('Showing {{from}} of {{total}}', { from: 1, total: 9 })).toBe('Showing 1 of 9');
  });

  it('keeps dots and colons in keys (no separators)', () => {
    expect(i18n.t('Stop ZoneMinder? Recording will halt.')).toBe(
      'Stop ZoneMinder? Recording will halt.',
    );
    expect(i18n.t('Load: {{value}}', { value: 2 })).toBe('Load: 2');
  });

  it('rejects unsupported languages', async () => {
    expect(isSupportedLanguage('xx')).toBe(false);
    await expect(changeLanguage('xx')).rejects.toThrow(/Unsupported language/);
  });

  it('flips document direction for RTL languages and back', async () => {
    await changeLanguage('he');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('he');
    await changeLanguage('en');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('resolves direction for regional variants from the base language', () => {
    expect(directionFor('he-IL')).toBe('rtl');
    expect(directionFor('pt-BR')).toBe('ltr');
    expect(applyDirection('ar')).toBe('rtl');
    applyDirection('en');
  });

  it('every language has a unique code and a direction', () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const l of LANGUAGES) expect(['ltr', 'rtl']).toContain(l.dir);
  });

  it('applies direction for a language detected from ?lang= at startup', async () => {
    window.history.replaceState(null, '', '/?lang=he');
    const fresh = setupI18n(i18next.createInstance());
    await new Promise((r) => setTimeout(r, 50));
    expect(fresh.language).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
    window.history.replaceState(null, '', '/');
    await changeLanguage('en');
    applyDirection('en');
  });
});
