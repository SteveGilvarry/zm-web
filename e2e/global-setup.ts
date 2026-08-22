import { chromium, type FullConfig } from '@playwright/test';
import { SEED } from './seed/seed-data';

/**
 * Seeded-mode preflight. Runs once before any worker starts and fails fast,
 * with instructions, when the hermetic stack is not up:
 *
 *   1. zm_api answers /api/v3/server/health_check at E2E_API_URL.
 *   2. The seeded admin can log in (proves seed.sql is loaded and the
 *      bcrypt hash matches the backend's verifier).
 *   3. The dev server has compiled the login page. Vite transforms modules on
 *      first request; with several workers that cold compile otherwise lands
 *      inside the first tests' 30 s budget and they time out on /login.
 */
const HEALTH_PATH = '/api/v3/server/health_check';
const LOGIN_PATH = '/api/v3/auth/login';

function apiUrl(): string {
  return (process.env.E2E_API_URL ?? 'http://127.0.0.1:8089').replace(/\/$/, '');
}

async function waitForHealth(base: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base + HEALTH_PATH, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(
    [
      `zm_api is not answering at ${base}${HEALTH_PATH} (${lastError}).`,
      'Seeded e2e needs the hermetic stack running:',
      '  e2e/seed/up.sh      # MariaDB + schema + seed',
      '  e2e/seed/api.sh     # zm_api against it (foreground)',
      'Point E2E_API_URL at zm_api if it is not on http://127.0.0.1:8089.',
    ].join('\n'),
  );
}

async function checkSeededLogin(base: string): Promise<void> {
  const res = await fetch(base + LOGIN_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(SEED.admin),
    signal: AbortSignal.timeout(5_000),
  });
  if (res.ok) return;
  const body = await res.text().catch(() => '');
  throw new Error(
    [
      `Seeded admin '${SEED.admin.username}' cannot log in at ${base}${LOGIN_PATH} (HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}).`,
      'Either seed.sql is not loaded into the database zm_api is using, or zm_api points at a different database.',
      '  e2e/seed/reset.sh   # reload the seed',
      '  e2e/seed/api.sh     # restart zm_api with the e2e DB settings',
    ].join('\n'),
  );
}

async function warmDevServer(baseURL: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(baseURL + '/login', { waitUntil: 'networkidle', timeout: 120_000 });
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const base = apiUrl();
  const timeoutMs = Number(process.env.E2E_API_WAIT_SECS ?? 30) * 1_000;
  await waitForHealth(base, timeoutMs);
  await checkSeededLogin(base);
  const baseURL = config.projects[0]?.use.baseURL;
  if (baseURL) await warmDevServer(baseURL);
  console.log(`[e2e] seeded mode: zm_api healthy at ${base}, seeded admin login OK, dev server warm`);
}
