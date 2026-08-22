import type { Locator, Page } from '@playwright/test';
import {
  test,
  expect,
  gotoSkin,
  SKINS,
  seededOnly,
  ANONYMOUS,
  SIGN_IN_BUTTON,
  type Skin,
} from './fixtures';
import { ROUTES, type PageKey } from './routes';
import { SEED } from './seed/seed-data';

/**
 * The breadth half of the release criterion "every route has a happy path in
 * both skins". One test per page key per skin: navigate, then wait for an
 * anchor that only that page renders, so a blank shell or a fallback page
 * fails instead of passing.
 *
 * Anchors are roles, accessible names, testids and hrefs — never class names,
 * which are being retokenised in parallel. Depth (filters, sorting,
 * mutations) lives in the per-feature specs; each of those carries the same
 * `@route:` tag, and `route-coverage.spec.ts` enforces that every key in
 * `src/skins/pageKeys.ts` has at least one.
 */
type Anchor = (page: Page, skin: Skin) => Locator;

const ANCHORS: Record<PageKey, Anchor> = {
  login: (p) => p.getByRole('button', { name: SIGN_IN_BUTTON }),
  console: (p) => p.locator(`a[href="/monitors/${SEED.monitors.frontDoor}"]`).first(),
  'monitors.list': (p) => p.locator(`a[href="/monitors/${SEED.monitors.frontDoor}"]`).first(),
  'monitors.watch': (p) => p.getByTestId('watch-runtime'),
  // Classic prints the zone name in a table row (and in a hidden SVG
  // <title>); modern renders it as a button in the zone list.
  'monitors.zones': (p, skin) =>
    skin === 'classic'
      ? p.getByRole('cell', { name: 'e2e-All', exact: true })
      : p.getByRole('button', { name: /^e2e-All/ }),
  // Classic montage is a grid of snapshot cells; modern has the preset rail.
  montage: (p, skin) =>
    skin === 'classic'
      ? p.getByTestId(`montage-classic-cell-${SEED.monitors.frontDoor}`)
      // The presets moved behind the toolbar's Layout disclosure, so the
      // anchor is the disclosure itself.
      : p.getByRole('button', { name: 'Layout' }),
  montagereview: (p) => p.getByRole('button', { name: 'PLAY' }),
  cycle: (p) => p.getByRole('button', { name: /next monitor/i }),
  'events.list': (p) => p.locator(`a[href="/events/${SEED.events.open}"]`).first(),
  'events.detail': (p) => p.locator(`a[href="/events/${SEED.events.withFrames[0]}/frames"]`).first(),
  'events.frames': (p) => p.getByTestId('frames-table'),
  filters: (p) => p.getByRole('button', { name: /add condition/i }),
  groups: (p) => p.getByRole('button', { name: /new group/i }),
  logs: (p) => p.getByRole('button', { name: /download csv/i }),
  'reports.list': (p) => p.locator(`a[href="/reports/${SEED.report}"]`).first(),
  'reports.detail': (p) => p.getByRole('heading', { name: /events per hour/i }),
  audit: (p) => p.getByTestId(`audit-row-${SEED.monitors.frontDoor}`),
  'settings.options': (p) => p.getByRole('heading', { name: /appearance/i }),
  'settings.users': (p) => p.getByText(SEED.viewer.username).first(),
  'settings.servers': (p) => p.getByRole('button', { name: /^edit e2e-server-1$/i }),
  'settings.storage': (p) => p.getByRole('button', { name: /^edit e2e-events$/i }),
  'settings.state': (p) => p.getByRole('button', { name: /^apply state e2e-night$/i }),
  'settings.ptzControls': (p) => p.getByText('e2e-PTZ Dome (Pelco-D)').first(),
};

test.describe('Route happy paths', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    for (const route of ROUTES.filter((r) => r.auth)) {
      test(`${route.key} renders in ${skin} @route:${route.key}`, async ({ loggedInPage: page }) => {
        await gotoSkin(page, route.path, skin);
        await expect(ANCHORS[route.key](page, skin)).toBeVisible({ timeout: 20_000 });
        // No page may fall back to another skin's implementation silently.
        await expect(page.locator('[data-skin-fallback]')).toHaveCount(0);
      });
    }

  }
});

/**
 * Login is the one page you must be signed out to see: `useLoginPage` bounces
 * an authenticated visitor straight back to the console. It renders no
 * AppShell either, so the chosen skin shows up in the persisted UI store
 * rather than on <html>.
 */
test.describe('Route happy paths — signed out', () => {
  test.skip(seededOnly.condition, seededOnly.reason);
  test.use({ storageState: ANONYMOUS });

  for (const skin of SKINS) {
    test(`login renders in ${skin} @route:login`, async ({ page }) => {
      await gotoSkin(page, '/login', skin, { shell: false });
      await expect(ANCHORS.login(page, skin)).toBeVisible();
      await expect(page.getByRole('textbox', { name: /username/i })).toBeVisible();
      const stored = await page.evaluate(() => {
        const raw = window.localStorage.getItem('zm-ui');
        return raw ? (JSON.parse(raw).state.skin as string) : null;
      });
      expect(stored, '?skin= should persist the choice').toBe(skin);
    });
  }
});
