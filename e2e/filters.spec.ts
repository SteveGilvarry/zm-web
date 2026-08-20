import { test, expect } from './fixtures';

/**
 * Filters page — full CRUD round-trip against the real backend.
 *
 * The point of this spec is persistence: the filter is created with a
 * condition, the page is reloaded, the filter is re-opened and the
 * condition, sort and action flags must still be there (the earlier
 * version only checked the name survived, which hid the PUT `{query}`
 * bug for months). Each test mints a unique name so concurrent
 * webkit/chromium runs don't collide.
 */
test.describe('Filters — CRUD round-trip', () => {
  test('create with a condition, reload, re-open, edit, rename and delete', async ({ loggedInPage: page, browserName }) => {
    const baseName = `e2e-probe-${browserName}-${Date.now()}`;
    const renamed = `e2e-probe-renamed-${browserName}-${Date.now()}`;

    await page.goto('/filters');
    await page.getByRole('button', { name: /new filter/i }).click();

    const nameInput = page.getByPlaceholder('Untitled filter');
    await expect(nameInput).toBeVisible();
    await nameInput.fill(baseName);

    // One condition: Cause contains "Motion".
    await page.getByRole('button', { name: /add condition/i }).click();
    const row = page.getByTestId('filter-term').first();
    await row.getByLabel('Attribute').selectOption('Cause');
    await row.getByLabel('Operator').selectOption('LIKE');
    await row.getByLabel('Value').fill('Motion');

    // Sort by max score descending, limit 25, archive in background every 120 s.
    await page.getByLabel(/sort by/i).selectOption('MaxScore');
    await page.getByLabel(/sort direction/i).selectOption('0');
    await page.getByLabel(/limit to first/i).fill('25');
    await page.getByRole('switch', { name: /^archive all matches/i }).click();
    await page.getByRole('switch', { name: /run in background/i }).click();
    await page.getByLabel(/execute interval/i).fill('120');

    const createResp = page.waitForResponse(
      (r) => r.url().endsWith('/api/v3/filters') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^create$/i }).click();
    const created = await createResp;
    expect(created.status()).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.auto_archive).toBe(1);
    expect(createdBody.background).toBe(1);
    expect(createdBody.execute_interval).toBe(120);
    expect(JSON.parse(createdBody.query_json)).toEqual({
      terms: [{ obr: '0', attr: 'Cause', op: 'LIKE', val: 'Motion', cbr: '0' }],
      sort_field: 'MaxScore', sort_asc: '0', limit: '25', skip_locked: '0',
    });

    await expect(page.getByRole('button', { name: new RegExp(`^${baseName}`) })).toBeVisible({ timeout: 10_000 });

    // Reload and re-open: the condition, sort, limit and flags must still be there.
    await page.reload();
    await page.getByRole('button', { name: new RegExp(`^${baseName}`) }).click();
    await expect(nameInput).toHaveValue(baseName);
    const reopened = page.getByTestId('filter-term');
    await expect(reopened).toHaveCount(1);
    await expect(reopened.first().getByLabel('Attribute')).toHaveValue('Cause');
    await expect(reopened.first().getByLabel('Operator')).toHaveValue('LIKE');
    await expect(reopened.first().getByLabel('Value')).toHaveValue('Motion');
    await expect(page.getByLabel(/sort by/i)).toHaveValue('MaxScore');
    await expect(page.getByLabel(/sort direction/i)).toHaveValue('0');
    await expect(page.getByLabel(/limit to first/i)).toHaveValue('25');
    await expect(page.getByRole('switch', { name: /^archive all matches/i })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('switch', { name: /run in background/i })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByLabel(/execute interval/i)).toHaveValue('120');

    // Edit: add a second condition, rename, save (PUT with query_json).
    await page.getByRole('button', { name: /add condition/i }).click();
    const second = page.getByTestId('filter-term').nth(1);
    await second.getByLabel('Attribute').selectOption('Archived');
    await second.getByLabel('Value').selectOption('0');
    await nameInput.fill(renamed);

    const updateResp = page.waitForResponse(
      (r) => /\/api\/v3\/filters\/\d+$/.test(r.url()) && r.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: /^save$/i }).click();
    const updated = await updateResp;
    expect(updated.status()).toBe(200);
    const putBody = updated.request().postDataJSON();
    expect(putBody.query_json).toBeDefined();
    expect(putBody.query).toBeUndefined();
    expect(JSON.parse(putBody.query_json).terms).toHaveLength(2);

    await expect(page.getByRole('button', { name: new RegExp(`^${renamed}`) })).toBeVisible({ timeout: 10_000 });

    // Reload once more and confirm the edit persisted.
    await page.reload();
    await page.getByRole('button', { name: new RegExp(`^${renamed}`) }).click();
    await expect(page.getByTestId('filter-term')).toHaveCount(2);
    await expect(page.getByTestId('filter-term').nth(1).getByLabel('Attribute')).toHaveValue('Archived');

    // Delete.
    page.once('dialog', (d) => d.accept());
    const deleteResp = page.waitForResponse(
      (r) => /\/api\/v3\/filters\/\d+$/.test(r.url()) && r.request().method() === 'DELETE',
    );
    await page.getByRole('button', { name: `Delete ${renamed}` }).click();
    await deleteResp;
    await expect(page.getByRole('button', { name: new RegExp(`^${renamed}`) })).toHaveCount(0, { timeout: 10_000 });
  });

  test('the stock PurgeWhenFull filter opens with its three conditions and Save is enabled', async ({ loggedInPage: page }) => {
    await page.goto('/filters');
    // Wait for the saved list to load before deciding whether the stock filter exists.
    await page.getByRole('button', { name: /new filter/i }).waitFor();
    const purge = page.getByRole('button', { name: /^PurgeWhenFull/ });
    await purge.waitFor({ timeout: 10_000 }).catch(() => {});
    test.skip(!(await purge.count()), 'PurgeWhenFull is not present on this backend');
    await purge.click();
    await expect(page.getByTestId('filter-term')).toHaveCount(3);
    await expect(page.getByTestId('filter-term').nth(1).getByLabel('Attribute')).toHaveValue('DiskPercent');
    await expect(page.getByRole('switch', { name: /delete all matches/i })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('button', { name: /^save$/i })).toBeEnabled();
    // Read-only check: we never click Save here.
  });
});
