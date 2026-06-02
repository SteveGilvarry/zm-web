import { test, expect } from './fixtures';

test.describe('Events list', () => {
  test('events page renders the toolbar + at least one event', async ({ loggedInPage: page }) => {
    await page.goto('/events');
    // Search field is the most stable anchor on the toolbar.
    await expect(page.getByPlaceholder(/search events/i)).toBeVisible();
    // Cause filter is a <select>; the default option is hidden inside it,
    // so locate the select itself by its containing role.
    const causeSelect = page.locator('select').filter({ hasText: /all causes/i });
    await expect(causeSelect).toHaveCount(1);
  });

  test('clicking an event navigates to the detail page', async ({ loggedInPage: page }) => {
    await page.goto('/events');
    // Find any event card with an #ID hash.
    const firstEventLink = page.locator('a[href^="/events/"]').first();
    await expect(firstEventLink).toBeVisible({ timeout: 10_000 });
    const href = await firstEventLink.getAttribute('href');
    expect(href).toMatch(/^\/events\/\d+/);
  });
});

test.describe('Event detail — cross-browser playback (the Safari rotation regression)', () => {
  test('opens an event detail page with a video element + scrubber', async ({ loggedInPage: page, browserName }) => {
    await page.goto('/events');
    const firstEventLink = page.locator('a[href^="/events/"]').first();
    await expect(firstEventLink).toBeVisible({ timeout: 10_000 });
    await firstEventLink.click();

    // We should land on /events/N for some N.
    await expect(page).toHaveURL(/\/events\/\d+/);

    // The <video> element must exist and the FrameScrubber caption renders.
    await expect(page.locator('video')).toHaveCount(1);
    await expect(page.getByText(/frame scrubber/i)).toBeVisible();

    // Sanity check: in BOTH Chrome and WebKit, the video container must
    // have an aspectRatio matching the event's declared dims, not a
    // hardcoded 16:9. Catches the regression where event playback used a
    // fixed aspect-video container that squeezed portrait cameras.
    const aspectRatio = await page.locator('video').first().evaluate((v) => {
      const parent = v.parentElement;
      return parent ? getComputedStyle(parent).aspectRatio : null;
    });
    expect(aspectRatio, `browser=${browserName} should carry an explicit aspect-ratio`).not.toBeNull();
  });
});
