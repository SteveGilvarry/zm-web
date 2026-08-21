import type { Page } from '@playwright/test';
import {
  test,
  expect,
  gotoSkin,
  SKINS,
  seededOnly,
  scratchEvent,
  apiFetch,
} from './fixtures';
import { SEED } from './seed/seed-data';

/**
 * Event detail and its frames table, in both skins. The seeded stack has no
 * video files on disk, so these specs assert the controls, the navigation and
 * the requests that go out — not that pixels move. Real playback stays in the
 * live suite (`events-playback.spec.ts`), which runs against a box with media.
 */

const EVENT = SEED.events.withFrames[0]; // 9002 — 10 frames, tagged, mid-list

function eventPatch(p: Page, id: number) {
  return p.waitForResponse(
    (r) => r.url().endsWith(`/api/v3/events/${id}`) && r.request().method() === 'PATCH',
    { timeout: 15_000 },
  );
}

/** Archive is a button in modern and a toolbar button in classic — same name. */
function archiveButton(p: Page) {
  return p.getByRole('button', { name: /^(archive|unarchive)$/i }).first();
}

test.describe('Event detail', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: shows the playback surface, stats and tags @route:events.detail`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, `/events/${EVENT}`, skin);

      await expect(page.locator('video')).toHaveCount(1);
      await expect(page.getByText(/frame scrubber/i)).toBeVisible();
      // Replay mode and speed are the two controls every legacy operator uses.
      await expect(page.getByLabel(/replay/i).first()).toBeVisible();
      await expect(page.getByLabel('Playback speed')).toBeVisible();
      // The seeded tag link renders and can be removed (we do not click it).
      await expect(page.getByRole('button', { name: /remove tag e2e-person/i })).toBeVisible();
      // Frames link points at the sibling route.
      await expect(page.locator(`a[href="/events/${EVENT}/frames"]`).first()).toBeVisible();
    });

    test(`${skin}: prev/next walk the monitor's events @route:events.detail`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, `/events/${EVENT}`, skin);

      // 9002 is the newest event on its monitor, so Next is at the end of
      // the walk and starts disabled; step back first, then forward.
      const prev = page.getByRole('button', { name: /^previous event$/i });
      const next = page.getByRole('button', { name: /^next event$/i });
      await expect(next).toBeDisabled();
      await expect(prev).toBeEnabled();

      await prev.click();
      await expect(page).toHaveURL(/\/events\/\d+/);
      const older = Number(new URL(page.url()).pathname.split('/').pop());
      expect(older).not.toBe(EVENT);

      await page.getByRole('button', { name: /^next event$/i }).click();
      await expect(page).toHaveURL(new RegExp(`/events/${EVENT}(\\?|$)`));
    });

    test(`${skin}: archive round-trips through PATCH @route:events.detail`, async ({
      loggedInPage: page,
    }, testInfo) => {
      const id = scratchEvent(testInfo.project.name, skin);
      await gotoSkin(page, `/events/${id}`, skin);

      const pending = eventPatch(page, id);
      await archiveButton(page).click();
      const resp = await pending;
      expect(resp.status()).toBe(200);
      expect(resp.request().postDataJSON()).toMatchObject({ archived: true });

      // The backend really holds it, not just the cache.
      const after = await apiFetch(page, `/api/v3/events/${id}`);
      expect((after.body as { archived: number }).archived).toBe(1);

      // Put it back the way the fixture set expects.
      const undo = await apiFetch(page, `/api/v3/events/${id}`, {
        method: 'PATCH',
        body: { archived: false },
      });
      expect(undo.status).toBe(200);
    });

    test(`${skin}: Edit saves the notes field @route:events.detail`, async ({
      loggedInPage: page,
    }, testInfo) => {
      const id = scratchEvent(testInfo.project.name, skin);
      const before = await apiFetch(page, `/api/v3/events/${id}`);
      const originalNotes = (before.body as { notes: string | null }).notes ?? '';
      const notes = `e2e-probe ${testInfo.project.name} ${skin} ${Date.now()}`;

      await gotoSkin(page, `/events/${id}`, skin);
      await page.getByRole('button', { name: /^edit$/i }).first().click();

      const form = page.getByTestId('event-edit-form');
      await expect(form).toBeVisible();
      await form.getByLabel(/event notes/i).fill(notes);

      const pending = eventPatch(page, id);
      await form.getByRole('button', { name: /^save$/i }).click();
      const resp = await pending;
      expect(resp.status()).toBe(200);
      expect(resp.request().postDataJSON()).toMatchObject({ notes });

      await expect(form).toHaveCount(0);
      const after = await apiFetch(page, `/api/v3/events/${id}`);
      expect((after.body as { notes: string }).notes).toBe(notes);

      await apiFetch(page, `/api/v3/events/${id}`, {
        method: 'PATCH',
        body: { notes: originalNotes },
      });
    });

    test(`${skin}: the frames link opens the per-frame table @route:events.frames`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, `/events/${EVENT}`, skin);
      await page.locator(`a[href="/events/${EVENT}/frames"]`).first().click();

      await expect(page).toHaveURL(new RegExp(`/events/${EVENT}/frames`));
      const table = page.getByTestId('frames-table');
      await expect(table).toBeVisible();
      // The seed gives 9002 ten frames, of which 4-6 are Alarm.
      await expect(table.locator('tbody tr')).toHaveCount(10);
      await expect(page.getByTestId('frame-row-5')).toContainText('Alarm');

      // And back to the event it belongs to.
      await page.getByRole('link', { name: /back to event/i }).click();
      await expect(page).toHaveURL(new RegExp(`/events/${EVENT}(\\?|$)`));
    });
  }
});

test.describe('Event frames', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: an event with no frames shows an empty table, not an error @route:events.frames`, async ({
      loggedInPage: page,
    }) => {
      // 9001 is the still-open Continuous event; the seed gives it no Frames.
      await gotoSkin(page, `/events/${SEED.events.open}/frames`, skin);
      await expect(page.getByRole('alert')).toHaveCount(0);
      const emptyOrTable = page
        .getByTestId('frames-table')
        .or(page.locator('[data-state="empty"]'));
      await expect(emptyOrTable.first()).toBeVisible();
    });
  }
});
