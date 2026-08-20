import { test, expect } from './fixtures';

/**
 * Monitor editor round-trip. The editor lives behind the "Edit
 * configuration" button on the monitor detail page; it overlays the page
 * with a tabbed form that PATCHes only changed keys on save.
 *
 * We change the `notes` field (free-form metadata; safe to mutate) on the
 * General tab, save, reload, and verify the value persists. Cleanup
 * restores the original notes value.
 */
test.describe('Monitor editor — notes round-trip', () => {
  let monitorId: string | null = null;
  let originalNotes: string | null = null;

  test('edit, save and verify the notes field persists', async ({ loggedInPage: page, browserName }) => {
    // React Query / Router devtools mount fixed-positioned overlays in dev
    // mode that occasionally intercept clicks on the editor footer in
    // webkit. Inject a style on every navigation that hides them.
    const hideDevtools = `
      .tsqd-parent-container, [data-testid="tanstack-query-devtools"],
      .TanStackRouterDevtools, [class*="TanStackRouterDevtools"] {
        display: none !important;
        pointer-events: none !important;
      }
    `;
    await page.addInitScript((css) => {
      const apply = () => {
        if (document.getElementById('e2e-hide-devtools')) return;
        const style = document.createElement('style');
        style.id = 'e2e-hide-devtools';
        style.textContent = css;
        document.head.appendChild(style);
      };
      if (document.readyState !== 'loading') apply();
      else document.addEventListener('DOMContentLoaded', apply);
    }, hideDevtools);

    await page.goto('/monitors');

    // First monitor card / row — its link target is /monitors/<id>.
    const firstMonitorLink = page.locator('a[href^="/monitors/"]').first();
    await expect(firstMonitorLink).toBeVisible({ timeout: 10_000 });
    const href = await firstMonitorLink.getAttribute('href');
    expect(href).toMatch(/^\/monitors\/\d+/);
    monitorId = href!.split('/').pop()!;

    await firstMonitorLink.click();
    await expect(page).toHaveURL(/\/monitors\/\d+/);

    // Open the editor overlay.
    await page.getByRole('button', { name: /edit configuration/i }).click();
    // The overlay header shows the monitor ID + name; the close button
    // confirms the overlay mounted.
    await expect(page.getByRole('button', { name: /^(cancel|close editor)$/i })).toBeVisible();

    // General tab is selected by default. The Notes textarea sits below
    // the Name input. We aria-label by the "Notes" mono caption, but the
    // simplest locator is to grab the only textarea on the General tab.
    const notesField = page.locator('textarea').first();
    await expect(notesField).toBeVisible();

    originalNotes = await notesField.inputValue();
    const newNotes = `e2e-${browserName}-${Date.now()}`;

    await notesField.fill(newNotes);

    // Save — PATCH /api/v3/monitors/<id>. The Save button text is
    // "Save 1" once one field is dirty; match on the leading "Save".
    const saveResp = page.waitForResponse(
      (r) => r.url().match(/\/api\/v3\/monitors\/\d+/) !== null && r.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: /^save( \d+)?$/i }).click();
    await saveResp;

    // After save the footer reverts to "No pending changes".
    await expect(page.getByText(/no pending changes/i)).toBeVisible({ timeout: 5_000 });

    // Close the editor and reload to verify persistence.
    await page.getByRole('button', { name: /^(cancel|close editor)$/i }).click();
    await page.reload();
    await page.getByRole('button', { name: /edit configuration/i }).click();

    const reloadedNotes = page.locator('textarea').first();
    await expect(reloadedNotes).toHaveValue(newNotes, { timeout: 10_000 });
  });

  test.afterEach(async ({ loggedInPage: page }) => {
    // Restore original notes if the test successfully captured them.
    if (monitorId == null || originalNotes == null) return;
    await page.goto(`/monitors/${monitorId}`);
    const editBtn = page.getByRole('button', { name: /edit configuration/i });
    if (await editBtn.isVisible().catch(() => false)) {
      await editBtn.click();
      const notesField = page.locator('textarea').first();
      if (await notesField.isVisible().catch(() => false)) {
        await notesField.fill(originalNotes);
        const saveBtn = page.getByRole('button', { name: /^save( \d+)?$/i });
        if (await saveBtn.isEnabled().catch(() => false)) {
          await saveBtn.click();
          // Best-effort; ignore failures so cleanup doesn't mask the
          // real test outcome.
          await page.waitForResponse(
            (r) => r.url().match(/\/api\/v3\/monitors\/\d+/) !== null && r.request().method() === 'PATCH',
            { timeout: 5_000 },
          ).catch(() => {});
        }
      }
    }
    monitorId = null;
    originalNotes = null;
  });
});
