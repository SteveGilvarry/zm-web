import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type Page } from '@playwright/test';
import { SEED } from './seed/seed-data';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Shared Playwright fixtures. A logged-in fixture spares every spec
 * from re-running the credential flow; tests that need a fresh login
 * (e.g. the auth refresh tests) use the bare `test` import directly.
 *
 * Credentials come from TEST_USERNAME / TEST_PASSWORD. In seeded mode
 * (E2E_MODE=seeded) they default to the admin that e2e/seed/seed.sql
 * creates; in live mode they are required and there is no fallback.
 */
export const E2E_MODE: 'seeded' | 'live' = process.env.E2E_MODE === 'seeded' ? 'seeded' : 'live';

/** Both skins, in the order specs iterate them. */
export const SKINS = ['modern', 'classic'] as const;
export type Skin = (typeof SKINS)[number];

/**
 * Only the hermetic stack has known ids, known row counts and rows that are
 * safe to mutate. Specs that assert on either skip themselves in live mode
 * rather than failing against whatever the dev box happens to hold.
 */
export const seededOnly = { condition: E2E_MODE !== 'seeded', reason: 'needs E2E_MODE=seeded' };

function credentials(): { username: string; password: string } {
  const username = process.env.TEST_USERNAME;
  const password = process.env.TEST_PASSWORD;
  if (username && password) return { username, password };
  if (E2E_MODE === 'seeded') return SEED.admin;
  throw new Error(
    'TEST_USERNAME and TEST_PASSWORD must be set for live e2e runs (put them in .env or the ' +
      'environment). For the hermetic suite run with E2E_MODE=seeded, which uses the seeded admin.',
  );
}

/**
 * Vite mounts the TanStack Router/Query devtools as fixed overlays in dev
 * mode. They intercept clicks in the page corner, add their own axe
 * violations and push the mobile viewport into horizontal overflow — none of
 * which ships. Hide them everywhere.
 */
const HIDE_DEVTOOLS_CSS = `
  .tsqd-parent-container, [data-testid="tanstack-query-devtools"],
  .TanStackRouterDevtools, [class*="TanStackRouterDevtools"],
  button[aria-label="Open TanStack Router Devtools"],
  button[aria-label="Open Tanstack query devtools"] {
    display: none !important;
    pointer-events: none !important;
  }
`;

export async function hideDevtools(page: Page): Promise<void> {
  await page.addInitScript((css: string) => {
    const apply = () => {
      if (document.getElementById('e2e-hide-devtools')) return;
      const style = document.createElement('style');
      style.id = 'e2e-hide-devtools';
      style.textContent = css;
      document.head.appendChild(style);
    };
    if (document.readyState !== 'loading') apply();
    else document.addEventListener('DOMContentLoaded', apply);
  }, HIDE_DEVTOOLS_CSS);
}

/**
 * The submit button on the login form. Modern labels it "Sign in", classic
 * "Login" (the legacy wording); a spec should not care which skin is
 * persisted in the context it was handed.
 */
export const SIGN_IN_BUTTON = /^(sign in|login)$/i;

export async function loginAs(
  page: Page,
  who: { username: string; password: string },
): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: /username/i }).fill(who.username);
  await page.getByRole('textbox', { name: /password/i }).fill(who.password);
  await page.getByRole('button', { name: SIGN_IN_BUTTON }).click();
  // Wait for redirect off the login page.
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15_000 });
}

export async function login(page: Page) {
  await loginAs(page, credentials());
}

/**
 * Navigate with an explicit skin. `?skin=` is consumed and stripped by the
 * root route's `beforeLoad`, which also persists the choice, so every later
 * in-app navigation in the same context stays on that skin.
 */
export async function gotoSkin(
  page: Page,
  path: string,
  skin: Skin,
  opts: { shell?: boolean } = {},
): Promise<void> {
  const sep = path.includes('?') ? '&' : '?';
  await page.goto(`${path}${sep}skin=${skin}`);
  // `useSkinRootClass` stamps <html data-skin="…"> once the shell mounts;
  // waiting on it means every later assertion runs against the right skin.
  // Login is the one page with no shell, so it never gets the attribute.
  if (opts.shell !== false) {
    await expect(page.locator('html')).toHaveAttribute('data-skin', skin);
  }
}

/**
 * Sign in once per worker and hand every test in it the saved storage state,
 * rather than driving the login form ~100 times. Two reasons: it takes about
 * a second off every test, and zm_api throttles `/auth/*` per IP, so a suite
 * this size otherwise starts failing on rate-limited logins.
 *
 * The state lives in `e2e/.auth/` (gitignored) and is rebuilt per run — the
 * file is deleted when the worker fixture first runs, so a stale token from
 * an earlier run is never reused.
 */
type WorkerFixtures = { adminStorageState: string };

const AUTH_DIR = path.join(HERE, '.auth');

export const test = base.extend<{ loggedInPage: Page; viewerPage: Page }, WorkerFixtures>({
  adminStorageState: [
    async ({ browser }, use, workerInfo) => {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
      const file = path.join(AUTH_DIR, `admin-${workerInfo.workerIndex}.json`);
      const context = await browser.newContext({
        baseURL: workerInfo.project.use.baseURL,
      });
      try {
        const page = await context.newPage();
        await hideDevtools(page);
        await login(page);
        await context.storageState({ path: file });
      } finally {
        await context.close();
      }
      await use(file);
    },
    { scope: 'worker' },
  ],

  // Every test starts from the signed-in state. Specs that need an anonymous
  // browser opt out with `test.use({ storageState: ANONYMOUS })`.
  storageState: ({ adminStorageState }, use) => use(adminStorageState),

  loggedInPage: async ({ page }, run) => {
    await hideDevtools(page);
    // `storageState` already carries the session; land somewhere real so the
    // auth store has rehydrated before the spec's first assertion.
    await page.goto('/');
    await run(page);
  },

  /**
   * Signed in as the seeded view-only account: `View` on Stream/Events/
   * Monitors/Groups/Snapshots and `None` on Control/Devices/System. Used by
   * the permission specs; seeded mode only, since no such account is
   * guaranteed on a live box.
   */
  viewerPage: async ({ page }, run) => {
    if (E2E_MODE !== 'seeded') {
      throw new Error('viewerPage needs the seeded stack (E2E_MODE=seeded)');
    }
    await hideDevtools(page);
    // Drop the admin session this context inherited, then sign in as the
    // view-only account for real.
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await loginAs(page, SEED.viewer);
    await run(page);
  },
});

/** `test.use({ storageState: ANONYMOUS })` for specs that must start signed out. */
export const ANONYMOUS = { cookies: [], origins: [] };

/**
 * A seeded event this test may mutate. Browser projects and skins run
 * concurrently against one database, so "the first row" or a hardcoded id
 * would have two workers archiving the same event and asserting on each
 * other's writes. Each (project, skin) pair gets its own row out of
 * `SEED.events.scratch`; the spec still has to put it back.
 */
export function scratchEvent(projectName: string, skin: Skin): number {
  const pool = SEED.events.scratch;
  let hash = skin === 'classic' ? 1 : 0;
  for (const ch of projectName) hash = (hash * 31 + ch.charCodeAt(0)) % 1_000_003;
  return pool[(hash * 2 + (skin === 'classic' ? 1 : 0)) % pool.length];
}

/**
 * Call an API endpoint with the page's own session — for arranging state a
 * spec needs and for putting rows back afterwards, without driving the UI.
 */
export async function apiFetch(
  page: Page,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(
    async ([p, method, body]) => {
      const raw = window.localStorage.getItem('zm-auth');
      const token = raw ? JSON.parse(raw).state.accessToken : null;
      const res = await fetch(p as string, {
        method: (method as string) || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body != null ? { body: body as string } : {}),
      });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* leave as text */
      }
      return { status: res.status, body: parsed };
    },
    [path, init.method ?? 'GET', init.body == null ? null : JSON.stringify(init.body)] as const,
  );
}

export { expect } from '@playwright/test';
