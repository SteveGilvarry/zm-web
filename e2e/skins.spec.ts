import { test, expect } from './fixtures';

/**
 * Skin switcher — modern <-> classic round-trip. The choice persists via
 * Zustand's persist middleware in localStorage under `zm-ui`, so a hard
 * reload should keep the chosen skin. The classic shell renders a
 * legacy-style top nav (the dashboard's centrepiece text "ZoneMinder" in
 * amber); the modern shell renders a left <aside> sidebar.
 */
test.describe('Skin switching', () => {
  test('switch modern → classic, persist across reload, switch back @route:settings.options', async ({ loggedInPage: page }) => {
    // Start from the modern Console — the sidebar should be visible. Scoped
    // by name: the console also has an activity rail, which is an <aside>.
    await page.goto('/');
    await expect(page.getByRole('complementary', { name: 'Sidebar' })).toBeVisible();

    // Navigate to Settings (Appearance lives at the top of the settings page).
    await page.goto('/settings');

    // The Appearance section exposes two cards: "Modern" and "Classic
    // ZoneMinder". Click the Classic option.
    await page.getByRole('button', { name: /classic zoneminder/i }).click();

    // Classic shell mounts: the legacy top nav has the amber "ZoneMinder"
    // brand and no <aside> sidebar.
    await expect(page.getByText('ZoneMinder', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('complementary', { name: 'Sidebar' })).toHaveCount(0);

    // Persistence check — Zustand persist stores under `zm-ui`.
    const stored = await page.evaluate(() => {
      const raw = window.localStorage.getItem('zm-ui');
      if (!raw) return null;
      try {
        return JSON.parse(raw).state.skin as string;
      } catch {
        return null;
      }
    });
    expect(stored).toBe('classic');

    // Hard reload — classic should still be selected.
    await page.reload();
    await expect(page.getByText('ZoneMinder', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('complementary', { name: 'Sidebar' })).toHaveCount(0);

    // Switch back to Modern from the classic settings page.
    // The Appearance panel is still on /settings under the classic skin.
    await page.goto('/settings');
    await page.getByRole('button', { name: /modern/i }).click();

    // Modern shell remounts: the sidebar comes back.
    await expect(page.getByRole('complementary', { name: 'Sidebar' }))
      .toBeVisible({ timeout: 10_000 });
  });

  // No cleanup needed: every test gets its own browser context, so the
  // persisted skin cannot leak into the next one.
});
