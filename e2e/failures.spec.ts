import type { Page } from '@playwright/test';
import {
  test,
  expect,
  gotoSkin,
  login,
  SKINS,
  seededOnly,
  ANONYMOUS,
} from './fixtures';
import { SEED } from './seed/seed-data';

/**
 * The paths that used to fail silently: a backend that is down, a session
 * that has run out, an action the account is not allowed to take, and a
 * stream that will not start. Every one of them has to reach the operator as
 * a visible, honest state — never an empty panel or a spinner that never
 * resolves.
 *
 * These are the only specs that fake the backend (`page.route`); everything
 * else in the seeded suite talks to the real zm_api.
 */

/** Answer every matching call with a 500, as a dead backend would. */
async function breakRoute(page: Page, pattern: string) {
  await page.route(pattern, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ kind: 'INTERNAL_ERROR', error_message: 'e2e forced failure' }),
    }),
  );
}

test.describe('Failure paths — backend down', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: a 500 from the events list shows the unreachable state @route:events.list`, async ({
      loggedInPage: page,
    }) => {
      await breakRoute(page, '**/api/v3/events*');
      await gotoSkin(page, '/events', skin);

      const alert = page.locator('[data-state="unreachable"]');
      await expect(alert).toBeVisible({ timeout: 40_000 });
      await expect(alert).toContainText(/cannot reach the server/i);
      // …with a way out, not a dead end.
      await expect(alert.getByRole('button', { name: /retry/i })).toBeVisible();
    });

    test(`${skin}: a 500 from the monitors list shows the unreachable state @route:monitors.list`, async ({
      loggedInPage: page,
    }) => {
      await breakRoute(page, '**/api/v3/monitors*');
      await gotoSkin(page, '/monitors', skin);

      await expect(page.locator('[data-state="unreachable"]').first()).toBeVisible({
        timeout: 40_000,
      });
      // No monitor tiles claiming everything is fine.
      await expect(page.locator(`a[href="/monitors/${SEED.monitors.frontDoor}"]`)).toHaveCount(0);
    });

    // Regression: classic logs and classic reports rendered <QueryState>
    // without `isError`/`error`, so a 500 arrived as an empty result and the
    // page said "No matching records found" — backend-down looking like
    // no-rows, the failure the test plan calls out by name.
    const wait = 40_000;

    test(`${skin}: a 500 from the log query shows the unreachable state @route:logs`, async ({
      loggedInPage: page,
    }) => {
      await breakRoute(page, '**/api/v3/logs*');
      await gotoSkin(page, '/logs', skin);
      await expect(page.locator('[data-state="unreachable"]').first()).toBeVisible({
        timeout: wait,
      });
    });

    test(`${skin}: a 500 from the reports list shows the unreachable state @route:reports.list`, async ({
      loggedInPage: page,
    }) => {
      await breakRoute(page, '**/api/v3/reports*');
      await gotoSkin(page, '/reports', skin);
      await expect(page.locator('[data-state="unreachable"]').first()).toBeVisible({
        timeout: wait,
      });
    });
  }
});

test.describe('Failure paths — expired session', () => {
  test.skip(seededOnly.condition, seededOnly.reason);
  test.use({ storageState: ANONYMOUS });

  test('a refresh token the backend rejects bounces to /login?reason=expired @route:login', async ({
    page,
  }) => {
    await login(page);

    // From here the backend refuses to mint new tokens…
    await page.route('**/api/v3/auth/refresh', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error_message: 'refresh token expired' }),
      }),
    );
    // …and the stored access token is already past its expiry, so the store
    // fires a refresh the moment it rehydrates.
    await page.evaluate(() => {
      const raw = JSON.parse(window.localStorage.getItem('zm-auth')!);
      raw.state.user = { ...raw.state.user, exp: Math.floor(Date.now() / 1000) - 60 };
      window.localStorage.setItem('zm-auth', JSON.stringify(raw));
    });

    await page.goto('/events');

    await expect(page).toHaveURL(/\/login\?.*reason=expired/, { timeout: 20_000 });
    await expect(page.getByText(/your session has expired/i)).toBeVisible();
    // The way back to where they were is preserved.
    await expect(page).toHaveURL(/redirect=/);
    // And nothing stale is left behind to auto-log-in with.
    const cleared = await page.evaluate(() => {
      const raw = window.localStorage.getItem('zm-auth');
      return raw ? JSON.parse(raw).state.isAuthenticated : null;
    });
    expect(cleared).toBeFalsy();
  });
});

test.describe('Failure paths — not permitted', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: a view-only account gets the forbidden state, not an empty page @route:settings.users`, async ({
      viewerPage: page,
    }) => {
      // The seeded viewer holds System: None, so /users answers 403.
      const resp = page.waitForResponse((r) => r.url().includes('/api/v3/users'), {
        timeout: 40_000,
      });
      await gotoSkin(page, '/settings/users', skin);
      expect((await resp).status()).toBe(403);

      // Either surface is right — `RequirePerm` gates the page before it
      // renders, `QueryState` catches the 403 if the call goes out anyway —
      // as long as the operator is told why.
      await expect(page.getByText(/do not have permission/i).first()).toBeVisible({
        timeout: 40_000,
      });
      // "Not allowed" must not be dressed up as "backend is down".
      await expect(page.locator('[data-state="unreachable"]')).toHaveCount(0);
    });

    test(`${skin}: a view-only account is not offered the edit affordances @route:monitors.watch`, async ({
      viewerPage: page,
    }) => {
      await gotoSkin(page, `/monitors/${SEED.monitors.frontDoor}`, skin);
      await expect(page.getByTestId('watch-runtime')).toBeVisible({ timeout: 20_000 });

      // Monitors: View means look, don't touch — no editor, no forced alarm.
      await expect(page.getByRole('button', { name: /edit configuration|^edit monitor$/i }))
        .toHaveCount(0);
      await expect(page.getByRole('button', { name: /^force alarm$/i })).toHaveCount(0);
    });
  }
});

test.describe('Failure paths — stream will not start', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: a failed /live/start shows the error tile with a retry @route:monitors.watch`, async ({
      loggedInPage: page,
    }) => {
      await breakRoute(page, `**/api/v3/live/${SEED.monitors.frontDoor}/start`);
      await gotoSkin(page, `/monitors/${SEED.monitors.frontDoor}`, skin);

      // HLS gives up on the first rejected /start (WebRTC retries with
      // backoff first), so it is the deterministic path for this assertion.
      if (skin === 'classic') {
        await page.getByLabel(/^player/i).selectOption('hls');
      } else {
        await page.getByRole('button', { name: /^hls$/i }).first().click();
      }

      const tile = page.getByTestId('stream-error');
      await expect(tile).toBeVisible({ timeout: 40_000 });
      await expect(tile.getByRole('button', { name: /retry/i })).toBeVisible();
    });
  }
});
