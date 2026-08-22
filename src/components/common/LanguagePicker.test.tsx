/**
 * The picker lists only languages that actually have a catalogue on disk, and
 * has to resolve "which one is selected" from either the resolved language or
 * a regional tag like `pt-BR`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const changeLanguage = vi.fn(async () => {});
vi.mock('@/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/i18n')>()),
  changeLanguage,
}));

// Drive the reported language directly instead of mutating the shared i18n
// instance, which other test files in the same worker also read.
const i18nState = { resolvedLanguage: 'en', language: 'en' };
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: i18nState,
  }),
}));

const { LanguagePicker } = await import('./LanguagePicker');

beforeEach(() => {
  changeLanguage.mockClear();
  i18nState.resolvedLanguage = 'en';
  i18nState.language = 'en';
});

describe('LanguagePicker', () => {
  it('renders a labelled select listing the shipped catalogues', () => {
    render(<LanguagePicker />);
    const select = screen.getByRole('combobox', { name: 'Language' });
    expect(select).toHaveValue('en');

    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Deutsch' })).toBeInTheDocument();
    // RTL languages carry their direction on the option itself.
    expect(screen.getByRole('option', { name: 'עברית' })).toHaveAttribute('dir', 'rtl');
  });

  it('switches language through the i18n helper', async () => {
    const user = userEvent.setup();
    render(<LanguagePicker />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'fr');
    expect(changeLanguage).toHaveBeenCalledWith('fr');
  });

  it('reflects the resolved language as the current selection', () => {
    i18nState.resolvedLanguage = 'ja';
    i18nState.language = 'ja';
    render(<LanguagePicker />);
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('ja');
  });

  it('falls back to the base tag when the resolved language is regional', () => {
    i18nState.resolvedLanguage = 'de-AT';
    i18nState.language = 'de-AT';
    render(<LanguagePicker />);
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('de');
  });

  it('falls back to English for a language with no catalogue', () => {
    i18nState.resolvedLanguage = 'is';
    i18nState.language = 'is';
    render(<LanguagePicker />);
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('en');
  });

  it('accepts an extra class from the caller without losing the control', () => {
    render(<LanguagePicker className="ms-auto" />);
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeInTheDocument();
  });
});
