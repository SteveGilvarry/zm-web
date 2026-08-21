import {
  test,
  expect,
  gotoSkin,
  SKINS,
  seededOnly,
  scratchMonitor,
  apiFetch,
} from './fixtures';

/**
 * The monitor editor, reached from the Watch page in both skins. It PATCHes
 * only the fields that changed, so the assertion that matters is the request
 * body, not just that something was saved.
 *
 * `notes` is the field under test: free-form metadata no other spec reads.
 * The monitor is picked per browser project so two projects never edit the
 * same row, and the original value is restored through the API.
 */
test.describe('Monitor editor', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: editing notes PATCHes just that field and persists @route:monitors.watch`, async ({
      loggedInPage: page,
    }, testInfo) => {
      const id = scratchMonitor(testInfo.project.name);
      const before = await apiFetch(page, `/api/v3/monitors/${id}`);
      const originalNotes = (before.body as { notes: string | null }).notes ?? '';
      const notes = `e2e-probe ${testInfo.project.name} ${skin} ${Date.now()}`;

      await gotoSkin(page, `/monitors/${id}`, skin);

      try {
        await page
          .getByRole('button', { name: /edit configuration|^edit monitor$|^edit$/i })
          .first()
          .click();

        const notesField = page.getByRole('textbox', { name: /notes/i }).first();
        await expect(notesField).toBeVisible({ timeout: 15_000 });
        await notesField.fill(notes);

        const saved = page.waitForResponse(
          (r) => r.url().endsWith(`/api/v3/monitors/${id}`) && r.request().method() === 'PATCH',
          { timeout: 30_000 },
        );
        await page.getByRole('button', { name: /^save( \d+)?$/i }).first().click();
        const resp = await saved;

        expect(resp.status()).toBe(200);
        // Only the dirty field goes over the wire — a full-row PUT here would
        // stamp defaults over everything the editor does not render.
        expect(resp.request().postDataJSON()).toEqual({ notes });

        const after = await apiFetch(page, `/api/v3/monitors/${id}`);
        expect((after.body as { notes: string }).notes).toBe(notes);
      } finally {
        await apiFetch(page, `/api/v3/monitors/${id}`, {
          method: 'PATCH',
          body: { notes: originalNotes },
        });
      }
    });
  }
});
