import type { Page, Response } from '@playwright/test';
import { test, expect, gotoSkin, SKINS, seededOnly, type Skin } from './fixtures';
import { SEED } from './seed/seed-data';

/**
 * Events list — the highest-traffic page, in both skins. Every assertion is
 * either a role/accessible name or the HTTP request that goes out, so the
 * page can be restyled underneath without touching this file.
 *
 * The list opens on "the last hour" by default, which on the seed shows a
 * single event; each test clears that first so it works against the whole
 * 32-row fixture set.
 */

/** Skin-specific handles for the same controls. */
const UI = {
  modern: {
    monitorSelect: (p: Page) => p.getByLabel('Monitor', { exact: true }),
    sortByDuration: (p: Page) => p.getByRole('button', { name: /^sort by duration$/i }),
    perPage: (p: Page) => p.getByLabel(/per page/i).first(),
    archivedOnly: async (p: Page) => p.getByRole('button', { name: /^archived$/i }).click(),
  },
  classic: {
    monitorSelect: (p: Page) => p.getByLabel('Monitor =', { exact: true }),
    sortByDuration: (p: Page) => p.getByRole('button', { name: /^duration/i }),
    perPage: (p: Page) => p.getByLabel(/rows per page/i).first(),
    archivedOnly: async (p: Page) =>
      p.getByLabel('Archive Status =', { exact: true }).selectOption({ label: 'Archived Only' }),
  },
} satisfies Record<Skin, unknown>;

/**
 * The events list request the page fires, ignoring the counts endpoints.
 * `match` picks out the request a test is waiting for: the page may still
 * have its first (default-window) fetch in flight when a test arms the
 * waiter, and matching on the parameter under test skips it.
 */
function eventsList(p: Page, match: (params: URLSearchParams) => boolean = () => true) {
  return p.waitForResponse(
    (r) =>
      /\/api\/v3\/events(\?|$)/.test(r.url()) &&
      r.request().method() === 'GET' &&
      match(new URL(r.url()).searchParams),
    { timeout: 15_000 },
  );
}

async function total(resp: Response): Promise<number> {
  return (await resp.json()).total as number;
}

/** Open /events on `skin` and drop the default "last hour" window. */
async function openAllEvents(page: Page, skin: Skin): Promise<Response> {
  await gotoSkin(page, '/events', skin);
  const hint = page.getByTestId('default-hour-hint');
  await expect(hint).toBeVisible();
  // The window is gone once a request goes out without a start_time bound.
  const pending = eventsList(page, (q) => !q.has('start_time'));
  await hint.getByRole('button', { name: /clear/i }).click();
  return pending;
}

test.describe('Events list', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: clearing the default hour window shows every seeded event @route:events.list`, async ({
      loggedInPage: page,
    }) => {
      const resp = await openAllEvents(page, skin);
      expect(await total(resp)).toBe(SEED.events.count);
      await expect(page.getByTestId('default-hour-hint')).toHaveCount(0);
      await expect(page.locator(`a[href="/events/${SEED.events.last}"]`).first()).toBeVisible();
    });

    test(`${skin}: filtering by monitor narrows the request and the result @route:events.list`, async ({
      loggedInPage: page,
    }) => {
      await openAllEvents(page, skin);

      const pending = eventsList(page, (q) => q.has('monitor_id'));
      await UI[skin].monitorSelect(page).selectOption(String(SEED.monitors.driveway));
      const resp = await pending;

      expect(new URL(resp.url()).searchParams.get('monitor_id')).toBe(
        String(SEED.monitors.driveway),
      );
      expect(await total(resp)).toBe(8);
      // The URL carries the filter, so the view is shareable and reloadable.
      await expect(page).toHaveURL(new RegExp(`monitor_id=${SEED.monitors.driveway}`));
    });

    test(`${skin}: sorting by duration re-asks the backend @route:events.list`, async ({
      loggedInPage: page,
    }) => {
      await openAllEvents(page, skin);

      const pending = eventsList(page, (q) => q.get('sort') !== 'start_time');
      await UI[skin].sortByDuration(page).click();
      const params = new URL((await pending).url()).searchParams;

      expect(params.get('sort')).toBe('length');
      expect(params.get('direction')).toMatch(/^(asc|desc)$/);
    });

    test(`${skin}: paging asks for the next page @route:events.list`, async ({
      loggedInPage: page,
    }) => {
      await openAllEvents(page, skin);

      // Pin the page size so there is definitely more than one page of 32.
      const sized = eventsList(page, (q) => q.get('page_size') === '10');
      await UI[skin].perPage(page).selectOption('10');
      expect(new URL((await sized).url()).searchParams.get('page_size')).toBe('10');

      const paged = eventsList(page, (q) => q.get('page') === '2');
      await page.getByRole('button', { name: /^next page$/i }).first().click();
      const params = new URL((await paged).url()).searchParams;
      expect(params.get('page')).toBe('2');
      expect(params.get('page_size')).toBe('10');
    });

    test(`${skin}: the archived filter asks for archived events only @route:events.list`, async ({
      loggedInPage: page,
    }) => {
      await openAllEvents(page, skin);

      const pending = eventsList(page, (q) => q.has('archived'));
      await UI[skin].archivedOnly(page);
      const resp = await pending;

      expect(new URL(resp.url()).searchParams.get('archived')).toBe('true');
      // At least the six the seed archives. Not exactly six: the archive
      // round-trip specs run in parallel and have rows archived meanwhile.
      expect(await total(resp)).toBeGreaterThanOrEqual(SEED.events.archived.length);
      for (const id of SEED.events.archived) {
        await expect(page.locator(`a[href="/events/${id}"]`).first()).toBeVisible();
      }
    });

    test(`${skin}: the search box narrows the rows on the page @route:events.list`, async ({
      loggedInPage: page,
    }) => {
      await openAllEvents(page, skin);

      const search = page
        .locator('input[placeholder*="Search events" i], input[aria-label*="Search events" i]')
        .first();
      await expect(search).toBeVisible();
      await search.fill(String(SEED.events.last));

      // Whatever the layout, the matching event stays and a non-matching one
      // goes. Search is applied to the rows already fetched.
      await expect(page.locator(`a[href="/events/${SEED.events.last}"]`).first()).toBeVisible();
      await expect(page.locator(`a[href="/events/${SEED.events.open}"]`)).toHaveCount(0);
    });
  }
});
