import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect, gotoSkin, SKINS, seededOnly, ANONYMOUS } from './fixtures';
import { ROUTES } from './routes';

/**
 * Tier 7 of the test plan: axe on every route, in both skins.
 *
 * The app is not axe-clean yet, so this runs as a **ratchet** rather than a
 * pass/fail gate that nobody could turn on. `a11y-baseline.json` records the
 * serious/critical rules each page currently trips; a NEW rule fails the
 * build, a rule that disappears is reported so the baseline can be trimmed.
 * The release criterion ("axe clean on every route") is met when the baseline
 * file is `{}`.
 *
 * To re-record after fixing something:
 *
 *     E2E_MODE=seeded E2E_A11Y_UPDATE=1 npx playwright test a11y --workers=1
 *
 * Only `serious` and `critical` findings are gated at all; `minor` and
 * `moderate` land in a per-test attachment.
 */
const BLOCKING = new Set(['serious', 'critical']);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_FILE = path.join(HERE, 'a11y-baseline.json');
const UPDATING = process.env.E2E_A11Y_UPDATE === '1';

type Baseline = Record<string, string[]>;

function readBaseline(): Baseline {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) as Baseline;
  } catch {
    return {};
  }
}

/** Update pass only, and only under `--workers=1` (read-modify-write). */
function recordBaseline(key: string, rules: string[]) {
  const current = readBaseline();
  if (rules.length) current[key] = rules;
  else delete current[key];
  const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
}

async function audit(page: Page, key: string) {
  const results = await new AxeBuilder({ page })
    .include('#root')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const blocking = results.violations.filter((v) => BLOCKING.has(v.impact ?? ''));
  const advisory = results.violations.filter((v) => !BLOCKING.has(v.impact ?? ''));
  const found = [...new Set(blocking.map((v) => v.id))].sort();

  await test.info().attach(`axe-${key.replace(/\W+/g, '-')}`, {
    body: JSON.stringify(
      {
        blocking: blocking.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.length,
          first: v.nodes[0]?.target.join(' '),
        })),
        advisory: advisory.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });

  if (UPDATING) {
    recordBaseline(key, found);
    return;
  }

  const allowed = new Set(readBaseline()[key] ?? []);
  const regressions = blocking.filter((v) => !allowed.has(v.id));
  expect(
    regressions.map(
      (v) => `${v.impact}: ${v.id} — ${v.help} (${v.nodes.length} node(s), first: ${v.nodes[0]?.target.join(' ')})`,
    ),
    `new serious/critical accessibility violations on ${key}. If this is a deliberate, ` +
      'temporary regression, re-record with E2E_A11Y_UPDATE=1 — otherwise fix the page.',
  ).toEqual([]);

  const fixed = [...allowed].filter((id) => !found.includes(id));
  if (fixed.length) {
    // Not a failure: someone fixed something. Say so, so the baseline shrinks.
    console.log(`[a11y] ${key}: no longer failing ${fixed.join(', ')} — trim the baseline.`);
  }
}

test.describe('Accessibility', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    for (const route of ROUTES.filter((r) => r.auth)) {
      test(`${skin}: ${route.key} has no new axe violations @route:${route.key}`, async ({
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
    test(`${skin}: login has no new axe violations @route:login`, async ({ page }) => {
      await gotoSkin(page, '/login', skin, { shell: false });
      await audit(page, `${skin}/login`);
    });
  }
});
