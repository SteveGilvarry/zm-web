import { test, expect } from './fixtures';

/**
 * Filters page — full CRUD round-trip. The list lives at /filters with a
 * left rail of saved filters and a right editor pane. Save is enabled only
 * once a name is set; rules are optional for save but we add one to mirror
 * a realistic operator flow.
 *
 * Each test mints a unique name (Date.now() + browserName) so concurrent
 * webkit/chromium runs don't collide on the shared backend.
 */
test.describe('Filters — CRUD round-trip', () => {
  test('create, edit, rename and delete a filter', async ({ loggedInPage: page, browserName }) => {
    const baseName = `test-filter-${browserName}-${Date.now()}`;
    const renamed = `renamed-${browserName}-${Date.now()}`;

    await page.goto('/filters');

    // The "New filter" affordance starts a blank editor; selecting it
    // clears the editor (it's the default state anyway).
    await page.getByRole('button', { name: /new filter/i }).click();

    // Fill the name.
    const nameInput = page.getByPlaceholder('Untitled filter');
    await expect(nameInput).toBeVisible();
    await nameInput.fill(baseName);

    // Add at least one rule. The default new rule is monitor_id=… — change
    // it to a cause-based rule that doesn't depend on a specific monitor.
    await page.getByRole('button', { name: /add rule/i }).click();

    // The rule row contains 3 selects: field, operator, value. Pick cause/=.
    // The field select is the only one with the "Total score" option.
    const fieldSelect = page.locator('select', { has: page.locator('option', { hasText: 'Total score' }) }).first();
    await fieldSelect.selectOption('cause');
    // After switching to a string field, value becomes a text input.
    const valueInput = page.getByPlaceholder('value');
    await expect(valueInput).toBeVisible();
    await valueInput.fill('Motion');

    // Save — POST /api/v3/filters. Wait for the response so we know the
    // backend accepted before we navigate / reload.
    const createResp = page.waitForResponse(
      (r) => r.url().includes('/api/v3/filters') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^create$/i }).click();
    await createResp;

    // The new filter should appear in the rail.
    await expect(page.getByRole('button', { name: baseName, exact: true })).toBeVisible({ timeout: 10_000 });

    // Reload — verify persistence.
    await page.reload();
    await expect(page.getByRole('button', { name: baseName, exact: true })).toBeVisible({ timeout: 10_000 });

    // Edit: click into the saved entry, change the name, save.
    await page.getByRole('button', { name: baseName, exact: true }).click();
    await expect(nameInput).toHaveValue(baseName);
    await nameInput.fill(renamed);

    const updateResp = page.waitForResponse(
      (r) => r.url().match(/\/api\/v3\/filters\/\d+/) !== null && r.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: /^save$/i }).click();
    await updateResp;

    // The rail should now show the renamed entry.
    await expect(page.getByRole('button', { name: renamed, exact: true })).toBeVisible({ timeout: 10_000 });

    // Delete: accept the native confirm() and watch for the DELETE.
    page.once('dialog', (d) => d.accept());
    const deleteResp = page.waitForResponse(
      (r) => r.url().match(/\/api\/v3\/filters\/\d+/) !== null && r.request().method() === 'DELETE',
    );
    await page.getByRole('button', { name: `Delete ${renamed}` }).click();
    await deleteResp;

    // Filter should be gone from the rail.
    await expect(page.getByRole('button', { name: renamed, exact: true })).toHaveCount(0, { timeout: 10_000 });
  });
});
