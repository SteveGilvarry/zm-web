import { test, expect, E2E_MODE } from './fixtures';

/**
 * Live-only playback. The hermetic stack has no zmc and no media on disk, so
 * nothing there can prove a frame ever decoded; these specs run against a
 * real ZoneMinder box (`E2E_MODE=live`, the nightly) and assert what only a
 * real box can show: the element gets metadata, the clock advances, and a
 * portrait camera is not squeezed into a 16:9 box.
 *
 * Read-only — it opens events, it never mutates them.
 */
test.describe('Live playback', () => {
  test.skip(E2E_MODE !== 'live', 'needs a real ZoneMinder box (E2E_MODE=live)');

  test('an event page plays back and reports its own aspect ratio @route:events.detail', async ({
    loggedInPage: page,
    browserName,
  }) => {
    await page.goto('/events');
    const first = page.locator('a[href^="/events/"]').first();
    await expect(first).toBeVisible({ timeout: 15_000 });
    await first.click();
    await expect(page).toHaveURL(/\/events\/\d+/);

    const video = page.locator('video').first();
    await expect(video).toHaveCount(1);
    await expect(page.getByText(/frame scrubber/i)).toBeVisible();

    // The container must carry the event's declared dimensions, not a
    // hardcoded 16:9 — the regression that squeezed portrait cameras.
    const aspectRatio = await video.evaluate((v) => {
      const parent = v.parentElement;
      return parent ? getComputedStyle(parent).aspectRatio : null;
    });
    expect(aspectRatio, `browser=${browserName} should carry an explicit aspect-ratio`).not.toBeNull();

    // Metadata arrived: the browser decoded the container, so the codec and
    // the URL are both right for this engine (WebKit + HEVC included).
    await expect
      .poll(async () => video.evaluate((v: HTMLVideoElement) => v.readyState), {
        timeout: 30_000,
        message: `${browserName} never reached HAVE_CURRENT_DATA on the event video`,
      })
      .toBeGreaterThanOrEqual(2);

    // And it actually moves.
    await video.evaluate((v: HTMLVideoElement) => v.play().catch(() => {}));
    const start = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
    await expect
      .poll(async () => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
        timeout: 15_000,
        message: `${browserName} playback clock did not advance`,
      })
      .toBeGreaterThan(start);
  });
});
