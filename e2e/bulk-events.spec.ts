import type { Page } from '@playwright/test';
import {
  test,
  expect,
  gotoSkin,
  SKINS,
  seededOnly,
  scratchEvents,
  apiFetch,
  type Skin,
} from './fixtures';

/**
 * Bulk actions on the events list, in both skins. The earlier version of this
 * spec selected "the first two rows" on whatever backend it found, which made
 * it race the other projects and skip silently when the data was thin. It now
 * takes a reserved, disjoint pair of seeded events per (project, skin), acts
 * on exactly those, and unarchives them again.
 */

/** Select one event by id, whatever the row layout is. */
async function selectEvent(page: Page, skin: Skin, id: number) {
  if (skin === 'classic') {
    await page.getByRole('checkbox', { name: `Select event ${id}` }).check();
    return;
  }
  // Modern hides the per-card checkbox until hover; the row is the card that
  // links to this event.
  const card = page
    .locator('div')
    .filter({ has: page.locator(`a[href="/events/${id}"]`) })
    .filter({ has: page.getByRole('button', { name: 'Select event' }) })
    .last();
  await card.getByRole('button', { name: 'Select event' }).click({ force: true });
}

test.describe('Bulk events', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: selecting rows and archiving them PATCHes each one @route:events.list`, async ({
      loggedInPage: page,
    }, testInfo) => {
      const ids = scratchEvents(testInfo.project.name, skin, 2);

      await gotoSkin(page, '/events', skin);
      // Drop the default one-hour window, then widen the page so both
      // reserved rows are on screen whatever their position in the 32.
      await page.getByTestId('default-hour-hint').getByRole('button', { name: /clear/i }).click();
      await page.getByLabel(/(rows )?per page/i).first().selectOption('50');
      for (const id of ids) {
        await expect(page.locator(`a[href="/events/${id}"]`).first()).toBeVisible({
          timeout: 15_000,
        });
      }

      const patched = new Set<number>();
      page.on('response', (resp) => {
        const m = resp.url().match(/\/api\/v3\/events\/(\d+)$/);
        if (m && resp.request().method() === 'PATCH' && resp.ok()) patched.add(Number(m[1]));
      });

      try {
        for (const id of ids) await selectEvent(page, skin, id);

        // The selection is reported before anything destructive happens.
        await expect(page.getByText(`${ids.length} selected`).first()).toBeVisible();

        await page
          .getByRole('button', { name: /^archive$/i })
          .first()
          .click();

        // Every selected row produced its own PATCH…
        await expect(() => expect([...patched].sort()).toEqual([...ids].sort())).toPass({
          timeout: 30_000,
        });

        // …and the backend agrees, not just the cache.
        for (const id of ids) {
          const after = await apiFetch(page, `/api/v3/events/${id}`);
          expect((after.body as { archived: number }).archived, `event ${id}`).toBe(1);
        }
      } finally {
        for (const id of ids) {
          await apiFetch(page, `/api/v3/events/${id}`, {
            method: 'PATCH',
            body: { archived: false },
          });
        }
      }
    });
  }
});
