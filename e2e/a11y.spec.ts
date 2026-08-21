import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect, gotoSkin, SKINS, seededOnly, ANONYMOUS } from './fixtures';
import { ROUTES } from './routes';

/**
 * Tier 7 of the test plan: axe on every route, in both skins. Only `serious`
 * and `critical` findings fail — `minor`/`moderate` are reported in the
 * attachment so they can be worked through without blocking the build.
 *
 * Scoped to `#root` so nothing the harness injects is counted, and run with
 * the dev-tools overlays hidden (see `hideDevtools` in fixtures).
 */
const BLOCKING = new Set(['serious', 'critical']);

async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .include('#root')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const blocking = results.violations.filter((v) => BLOCKING.has(v.impact ?? ''));
  const advisory = results.violations.filter((v) => !BLOCKING.has(v.impact ?? ''));

  if (advisory.length) {
    await test.info().attach(`axe-advisory-${label}`, {
      body: JSON.stringify(
        advisory.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
        null,
        2,
      ),
      contentType: 'application/json',
    });
  }

  expect(
    blocking.map((v) => `${v.impact}: ${v.id} — ${v.help} (${v.nodes.length} node(s), first: ${v.nodes[0]?.target.join(' ')})`),
    `serious/critical accessibility violations on ${label}`,
  ).toEqual([]);
}

test.describe('Accessibility', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    for (const route of ROUTES.filter((r) => r.auth)) {
      test(`${skin}: ${route.key} has no serious axe violations @route:${route.key}`, async ({
        loggedInPage: page,
      }) => {
        await gotoSkin(page, route.path, skin);
        // Give the page's first data render a moment; auditing a spinner
        // proves nothing about the table that replaces it.
        await page.waitForLoadState('networkidle').catch(() => {});
        await audit(page, `${skin}/${route.key}`);
      });
    }
  }
});

test.describe('Accessibility — signed out', () => {
  test.skip(seededOnly.condition, seededOnly.reason);
  test.use({ storageState: ANONYMOUS });

  for (const skin of SKINS) {
    test(`${skin}: login has no serious axe violations @route:login`, async ({ page }) => {
      await gotoSkin(page, '/login', skin, { shell: false });
      await audit(page, `${skin}/login`);
    });
  }
});
