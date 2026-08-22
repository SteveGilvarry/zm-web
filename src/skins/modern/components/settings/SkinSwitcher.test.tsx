/**
 * Settings → Appearance. The chooser is the one place the UI reads the
 * active skin as a value, so the assertions here are about what it writes
 * back into `useUiStore`: the skin, the theme, and the light-only skins
 * that must not offer a dark toggle at all.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { useUiStore } from '@/stores/ui';
import { SkinSwitcher } from './SkinSwitcher';

const MODERN = /Mission Control/;
const CLASSIC = /Classic ZoneMinder/;

beforeEach(() => {
  useUiStore.setState({ skin: 'modern', theme: 'system' });
});

const skinButton = (name: RegExp) => screen.getByRole('button', { name });
const themeButton = (name: string) =>
  within(screen.getByRole('group', { name: 'Theme' })).getByRole('button', { name });

describe('SkinSwitcher — skin choice', () => {
  it('lists every registered skin with its blurb and flags the active one', () => {
    renderWithProviders(<SkinSwitcher />);
    expect(skinButton(MODERN)).toHaveAccessibleName(/adaptive layouts, live thumbnails/);
    expect(skinButton(CLASSIC)).toHaveAccessibleName(/top nav and dense tables/);
    expect(skinButton(MODERN)).toHaveAccessibleName(/Active/);
    expect(skinButton(CLASSIC)).not.toHaveAccessibleName(/Active/);
  });

  it('writes the chosen skin to the ui store and moves the Active marker', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SkinSwitcher />);
    await user.click(skinButton(CLASSIC));

    expect(useUiStore.getState().skin).toBe('classic');
    expect(skinButton(CLASSIC)).toHaveAccessibleName(/Active/);
    expect(skinButton(MODERN)).not.toHaveAccessibleName(/Active/);
  });

  it('re-picking the active skin leaves it selected', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SkinSwitcher />);
    await user.click(skinButton(MODERN));
    expect(useUiStore.getState().skin).toBe('modern');
  });
});

describe('SkinSwitcher — theme', () => {
  it('marks the stored preference pressed and writes a new one through', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SkinSwitcher />);
    expect(themeButton('System')).toHaveAttribute('aria-pressed', 'true');

    await user.click(themeButton('Dark'));
    expect(useUiStore.getState().theme).toBe('dark');
    expect(themeButton('Dark')).toHaveAttribute('aria-pressed', 'true');
    expect(themeButton('System')).toHaveAttribute('aria-pressed', 'false');

    await user.click(themeButton('Light'));
    expect(useUiStore.getState().theme).toBe('light');
  });

  it('disables the theme toggle and says so for a light-only skin', async () => {
    const user = userEvent.setup();
    useUiStore.setState({ skin: 'classic' });
    renderWithProviders(<SkinSwitcher />);

    for (const label of ['System', 'Light', 'Dark']) {
      expect(themeButton(label)).toBeDisabled();
    }
    expect(screen.getByText('This skin is light only.')).toBeInTheDocument();

    await user.click(themeButton('Dark'));
    expect(useUiStore.getState().theme).toBe('system');
  });

  it('hides the light-only note while a dark-capable skin is active', () => {
    renderWithProviders(<SkinSwitcher />);
    expect(screen.queryByText('This skin is light only.')).not.toBeInTheDocument();
    expect(themeButton('Dark')).toBeEnabled();
  });
});

describe('SkinSwitcher — language', () => {
  it('offers the language picker alongside the skin and theme controls', () => {
    renderWithProviders(<SkinSwitcher />);
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('en');
  });
});

describe('SkinSwitcher — a skin the chooser has no copy for', () => {
  /**
   * `skinName` / `skinBlurb` translate by id and fall back to the registry's
   * own English text for an id they do not know; a definition that omits
   * `colorSchemes` is assumed to handle both. Neither branch is reachable
   * through the two shipped skins, so the registry is swapped for one test.
   */
  it('shows the registry text and keeps the theme toggle live', async () => {
    vi.resetModules();
    const neon = {
      id: 'neon',
      name: 'Neon Nights',
      description: 'A third-party skin the chooser has no strings for.',
      rootClass: 'skin-neon',
      Shell: () => null,
      pages: {},
    };
    vi.doMock('@/skins/registry', () => ({ skins: { neon }, useSkin: () => neon }));
    try {
      const { SkinSwitcher: Fresh } = await import('./SkinSwitcher');
      renderWithProviders(<Fresh />);

      expect(screen.getByRole('button', { name: /Neon Nights/ })).toHaveAccessibleName(
        /A third-party skin the chooser has no strings for\./,
      );
      expect(screen.queryByText('This skin is light only.')).not.toBeInTheDocument();
      expect(themeButton('Dark')).toBeEnabled();
    } finally {
      vi.doUnmock('@/skins/registry');
      vi.resetModules();
    }
  });
});
