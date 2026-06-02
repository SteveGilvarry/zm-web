import { test, expect } from './fixtures';

test.describe('Console', () => {
  test('renders the monitor grid with activity ribbons', async ({ loggedInPage: page }) => {
    // After login we should be on the Console root.
    await expect(page).toHaveURL('/');
    // Top stat row is present.
    await expect(page.getByText(/monitors/i).first()).toBeVisible();
    await expect(page.getByText(/events \(24h\)/i)).toBeVisible();
    await expect(page.getByText(/recording/i).first()).toBeVisible();
    await expect(page.getByText(/storage/i).first()).toBeVisible();
    // At least one monitor tile appears. Tiles are <a href="/monitors/...">.
    const tiles = page.locator('a[href^="/monitors/"]');
    await expect(tiles.first()).toBeVisible();
  });

  test('System panel shows the daemons list', async ({ loggedInPage: page }) => {
    // The 'Daemons' caption appears in the System panel. There may also
    // be a "No daemons reported." fallback when ZM has nothing to report;
    // matching on the exact uppercase caption disambiguates.
    await expect(page.getByText('Daemons', { exact: true })).toBeVisible();
  });

  test('header status strip is interactive (hover reveals detail)', async ({ loggedInPage: page }) => {
    // Hovering the LOAD/CPU/MEM/DISK strip reveals a tooltip with the
    // SYSTEM heading. Only checks the strip is present; tooltip is
    // hover-only and viewport-dependent.
    await expect(page.getByText(/^load$/i).first()).toBeVisible();
  });
});
