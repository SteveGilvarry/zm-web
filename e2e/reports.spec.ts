import { test, expect, gotoSkin, SKINS, seededOnly, apiFetch } from './fixtures';
import { SEED } from './seed/seed-data';

/**
 * Reports list and detail (`/reports`, `/reports/$id`) in both skins. The
 * seed ships report 9001 `e2e-Weekly motion` pointing at filter 9002, with a
 * 10080-minute interval — a week — which is also the shape that exposed the
 * "interval is seconds, not minutes" ambiguity upstream.
 */
test.describe('Reports', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: the list shows the seeded report and its filter @route:reports.list`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/reports', skin);

      const link = page.locator(`a[href="/reports/${SEED.report}"]`).first();
      await expect(link).toBeVisible();
      await expect(link).toContainText('e2e-Weekly motion');
      // The row names the filter it runs, not just an id.
      await expect(page.getByText('e2e-Motion only').first()).toBeVisible();
    });

    test(`${skin}: opening a report loads its saved settings @route:reports.detail`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/reports', skin);
      await page.locator(`a[href="/reports/${SEED.report}"]`).first().click();

      await expect(page).toHaveURL(new RegExp(`/reports/${SEED.report}`));
      await expect(page.getByRole('heading', { name: /events per hour/i })).toBeVisible();
      // Name and interval come back from the row, not from defaults.
      await expect(page.getByRole('textbox').first()).toHaveValue(/e2e-Weekly motion/);
      await expect(page.locator('input[type="number"]').first()).toHaveValue('10080');
      await expect(page.getByRole('button', { name: /^save$/i })).toBeVisible();
    });

    // Regression: report creation used to send `toISOString()` with
    // milliseconds, which zm_api rejects with 400 "Invalid start_date_time
    // format". `toApiDateTime()` trims the fractional part. Only a real
    // backend catches this — the MSW mocks accept anything.
    test(`${skin}: creating a report from the form @route:reports.list`, async ({
      loggedInPage: page,
    }, testInfo) => {
      // Reports.Name is varchar(30) and the API 500s past it, so keep the
      // unique-per-worker probe name short.
      const name = `e2e-${testInfo.project.name.slice(0, 4)}-${skin.slice(0, 3)}-${Date.now() % 1_000_000}`;
      await gotoSkin(page, '/reports', skin);
      await expect(page.getByText('e2e-Weekly motion').first()).toBeVisible();

      await page.getByRole('button', { name: /^(new report|\+ new)$/i }).first().click();
      const nameField = page.getByPlaceholder(/weekly motion report/i);
      await nameField.fill(name);

      const created = page.waitForResponse(
        (r) => r.url().endsWith('/api/v3/reports') && r.request().method() === 'POST',
        { timeout: 15_000 },
      );
      // Modern labels the submit "Create report"; classic's legacy form
      // labels it "Save".
      await page.getByRole('button', { name: /^(create report|save)$/i }).click();
      const createResp = await created;
      expect(createResp.status()).toBe(201);

      const id = (await createResp.json()).id as number;
      try {
        await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });
      } finally {
        await apiFetch(page, `/api/v3/reports/${id}`, { method: 'DELETE' });
      }
    });
  }
});
