import type { Page } from '@playwright/test';
import { test, expect, gotoSkin, SKINS, seededOnly, type Skin } from './fixtures';
import { SEED } from './seed/seed-data';

/**
 * Watch (`/monitors/$id`) in both skins.
 *
 * The seeded backend has no zmc, so `/live/{id}/start` answers 404 ("stream
 * socket not available") and `/monitors/{id}/alarm` answers 503 ("shared
 * memory not found"). That is on purpose: these specs assert the control
 * surface and the requests it sends — the shapes that broke silently in the
 * past — while the live suite asserts that pixels actually move.
 */

const MON = SEED.monitors.frontDoor;

const UI = {
  modern: {
    selectHls: (p: Page) => p.getByRole('button', { name: /^hls$/i }).first().click(),
    selectWebRtc: (p: Page) => p.getByRole('button', { name: /^webrtc$/i }).first().click(),
    stills: (p: Page) => p.getByRole('button', { name: /^stills$/i }).first().click(),
  },
  classic: {
    // The <label> wraps the <select>, so its accessible name carries the
    // option text too; match on the caption prefix.
    selectHls: (p: Page) => p.getByLabel(/^player/i).selectOption('hls'),
    selectWebRtc: (p: Page) => p.getByLabel(/^player/i).selectOption('webrtc'),
    stills: (p: Page) => p.getByRole('button', { name: /^stills$/i }).first().click(),
  },
} satisfies Record<Skin, unknown>;

function liveStart(p: Page, monitorId: number) {
  return p.waitForResponse(
    (r) => r.url().includes(`/api/v3/live/${monitorId}/start`) && r.request().method() === 'POST',
    { timeout: 20_000 },
  );
}

test.describe('Watch', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: shows the camera's runtime status and controls @route:monitors.watch`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, `/monitors/${MON}`, skin);

      // Runtime strip carries the capture/analysis FPS from Monitor_Status.
      await expect(page.getByTestId('watch-runtime')).toContainText('15.0');
      await expect(page.locator('video')).toHaveCount(1);
      // Both skins expose the legacy alarm controls and a scale picker.
      await expect(page.getByRole('button', { name: /^force alarm$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^cancel alarm$/i })).toBeVisible();
      await expect(page.getByLabel(/^scale/i).first()).toBeVisible();
      // …and a way back to the monitor's events.
      await expect(page.locator(`a[href*="/events?monitor_id=${MON}"]`).first()).toBeVisible();
    });

    test(`${skin}: switching the protocol re-starts the stream over HLS @route:monitors.watch`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, `/monitors/${MON}`, skin);

      const hls = liveStart(page, MON);
      await UI[skin].selectHls(page);
      const hlsReq = (await hls).request().postDataJSON();
      expect(hlsReq, 'HLS must be asked for explicitly').toMatchObject({ enable_hls: true });

      const rtc = liveStart(page, MON);
      await UI[skin].selectWebRtc(page);
      const rtcReq = (await rtc).request().postDataJSON();
      expect(rtcReq, 'WebRTC must be asked for explicitly').toMatchObject({ enable_webrtc: true });
    });

    test(`${skin}: Force Alarm sends the legacy alarm action @route:monitors.watch`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, `/monitors/${MON}`, skin);

      const pending = page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/v3/monitors/${MON}/alarm`) &&
          r.request().method() === 'PATCH' &&
          r.request().postDataJSON()?.action === 'on',
        { timeout: 15_000 },
      );
      // Forcing an alarm writes an event, so both skins confirm first.
      page.once('dialog', (d) => void d.accept());
      await page.getByRole('button', { name: /^force alarm$/i }).click();
      const resp = await pending;

      // No zmc on the hermetic stack, so the trigger cannot succeed. What
      // matters here is that the page says so instead of pretending: the
      // backend's reason is surfaced in an alert, not swallowed.
      expect(resp.status()).toBe(503);
      await expect(page.getByRole('alert').filter({ hasText: /alarm/i }).first()).toBeVisible();
    });


    test(`${skin}: a portrait camera's stage fits the frame @route:monitors.watch`, async ({
    loggedInPage: page,
  }) => {
    // 9002 is ROTATE_90: 1280×720 stored, 720×1280 displayed. Sized by width
    // it would be roughly a frame and a half tall, and the app frame does not
    // scroll — you could not see the bottom of the picture. It must be sized
    // by height instead, which is what a measured fit buys.
    await gotoSkin(page, `/monitors/${SEED.monitors.driveway}`, skin);

    const video = page.locator('video').first();
    await expect(video).toBeAttached();
    const viewport = page.viewportSize()!;
    await expect
      .poll(async () => {
        const b = await video.boundingBox();
        if (!b) return 'no box';
        const insideY = b.y >= -1 && b.y + b.height <= viewport.height + 1;
        const insideX = b.x >= -1 && b.x + b.width <= viewport.width + 1;
        // Portrait: taller than wide, and inside the frame on both axes.
        return insideX && insideY && b.height > b.width ? 'fits' : `${Math.round(b.width)}x${Math.round(b.height)}@${Math.round(b.y)}`;
      }, { timeout: 15_000 })
      .toBe('fits');
  });
    test(`${skin}: the stills view stops asking for a live stream @route:monitors.watch`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, `/monitors/${MON}`, skin);
      await UI[skin].stills(page);

      // Snapshot mode swaps the <video> for a refreshing <img> pointed at
      // /snapshot. Assert the swap, not that the picture renders: a hermetic
      // stack has no capture daemon, so the endpoint answers 404 (no shared
      // memory) or 503, and the app deliberately hides an image that fails to
      // load. This used to pass only because `.first()` sometimes matched a
      // different image that did load.
      const still = page.locator('img[src*="/snapshot"]').first();
      await expect(still).toHaveAttribute('src', /\/snapshot/, { timeout: 15_000 });

      // …and stops asking for a live one. The modern skin keeps both stream
      // hooks mounted and only starts the active protocol, so the <video>
      // element staying in the DOM is by design — what must stop is the
      // traffic.
      const liveCalls: string[] = [];
      page.on('request', (r) => {
        if (r.url().includes('/api/v3/live/') && r.method() === 'POST') liveCalls.push(r.url());
      });
      await page.waitForTimeout(2_000);
      expect(liveCalls).toEqual([]);
    });
  }
});
