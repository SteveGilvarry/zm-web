import { test, expect } from './fixtures';

/**
 * Bulk events — archive flow. Selecting events surfaces a sticky
 * BulkActionBar (role="region", aria-label="Bulk event actions") with
 * Archive / Unarchive / Delete buttons. The bar fans out one PATCH per id,
 * so we wait for the bar to vanish (signals all mutations finished and
 * the selection was cleared).
 *
 * The test is idempotent: archived IDs are tracked and unarchived in
 * afterEach. If the test environment has fewer than 2 unarchived events,
 * the test skips cleanly.
 */
test.describe('Bulk events — archive', () => {
  const archivedIds: number[] = [];

  test('select multiple events and archive them in one shot', async ({ loggedInPage: page }) => {
    await page.goto('/events');

    // Filter to unarchived so we know our test set isn't already archived.
    // The three-state filter has buttons labelled all / unarchived / archived.
    await page.getByRole('button', { name: /^unarchived$/i }).click();
    // Let the events query refetch under the new filter before we read it.
    await page.waitForResponse(
      (r) => r.url().includes('/api/v3/events') && r.url().includes('archived=false'),
      { timeout: 10_000 },
    ).catch(() => {});
    await page.waitForLoadState('networkidle');

    // EventCard rows in the modern skin: the only descendants on the
    // events list with this exact structure are <div> > <button
    // aria-label="Select event"> + <a href="/events/N">. Iterate row by
    // row so each captured id is paired with the click we make.
    const cardRows = page.locator('div.group:has(button[aria-label="Select event"]):has(a[href^="/events/"])');
    const cardCount = await cardRows.count();

    test.skip(cardCount < 2, 'Not enough unarchived events in the test environment for bulk archive');

    const selectCount = Math.min(3, cardCount);
    expect(selectCount).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < selectCount; i++) {
      const row = cardRows.nth(i);
      const href = await row.locator('a[href^="/events/"]').first().getAttribute('href');
      const m = href?.match(/\/events\/(\d+)/);
      if (m) archivedIds.push(parseInt(m[1], 10));
      // Force the click since the checkbox starts hidden until hover.
      await row.getByRole('button', { name: /^select event$/i }).click({ force: true });
    }

    // The bulk action bar should be visible with the right count.
    const bar = page.getByRole('region', { name: /bulk event actions/i });
    await expect(bar).toBeVisible();
    await expect(bar.getByText(`${selectCount} selected`)).toBeVisible();

    // Collect all PATCH responses for our archived IDs as the bar fans out.
    const patchedIds = new Set<number>();
    page.on('response', (resp) => {
      const m = resp.url().match(/\/api\/v3\/events\/(\d+)/);
      if (m && resp.request().method() === 'PATCH' && resp.ok()) {
        patchedIds.add(parseInt(m[1], 10));
      }
    });

    await bar.getByRole('button', { name: /^archive$/i }).click();

    // The bar should clear once all mutations resolve (onClear is invoked
    // from onSuccess after the sequential fan-out completes).
    await expect(bar).toBeHidden({ timeout: 30_000 });

    // Every selected id should have produced a successful PATCH.
    for (const id of archivedIds) {
      expect(patchedIds.has(id), `event ${id} should have been PATCHed`).toBe(true);
    }

    // Verify the events are archived on the backend (avoid pagination /
    // timing issues by querying directly).
    const archivedStatuses = await page.evaluate(async (ids) => {
      const raw = window.localStorage.getItem('zm-auth');
      if (!raw) return [];
      const { state } = JSON.parse(raw);
      const out: Array<{ id: number; archived: number }> = [];
      for (const id of ids) {
        const r = await fetch(`/api/v3/events/${id}`, {
          headers: { Authorization: `Bearer ${state.accessToken}` },
        });
        if (r.ok) {
          const ev = await r.json();
          out.push({ id, archived: ev.archived });
        }
      }
      return out;
    }, archivedIds);

    expect(archivedStatuses.length).toBe(archivedIds.length);
    for (const ev of archivedStatuses) {
      expect(ev.archived, `event ${ev.id} should be archived after bulk-archive`).toBe(1);
    }
  });

  test.afterEach(async ({ loggedInPage: page }) => {
    // Unarchive everything the test touched, one by one. Use the API
    // directly (via the same axios client) so cleanup is reliable even if
    // the UI is mid-render.
    for (const id of archivedIds.splice(0)) {
      await page.evaluate(async (eventId) => {
        try {
          const raw = window.localStorage.getItem('zm-auth');
          if (!raw) return;
          const { state } = JSON.parse(raw);
          await fetch(`/api/v3/events/${eventId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${state.accessToken}`,
            },
            body: JSON.stringify({ archived: false }),
          });
        } catch {
          // best-effort cleanup
        }
      }, id);
    }
  });
});
