import { test, expect, login, ANONYMOUS } from './fixtures';

/**
 * The session lifecycle, driven through the real form. These specs start
 * signed out — the rest of the suite inherits a worker-wide storage state,
 * which would make `login()` bounce straight back off /login.
 */
test.describe('authentication', () => {
  test.use({ storageState: ANONYMOUS });

  test('login → redirect to console; refresh keeps you logged in @route:login', async ({ page }) => {
    await login(page);
    // After login we land on the Console (not /login).
    await expect(page).not.toHaveURL(/\/login$/);
    // A page refresh should not bounce us back to login.
    await page.reload();
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('persisted refresh token survives a hard reload', async ({ page }) => {
    await login(page);
    // Read the persisted store and verify both tokens are present.
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('zm-auth');
      if (!raw) return null;
      const { state } = JSON.parse(raw);
      return {
        hasAccess: !!state.accessToken,
        hasRefresh: !!state.refreshToken,
        isAuth: state.isAuthenticated,
      };
    });
    expect(stored?.hasAccess).toBe(true);
    expect(stored?.hasRefresh).toBe(true);
    expect(stored?.isAuth).toBe(true);
  });

  test('corrupting the access token forces a refresh on the next API call', async ({ page }) => {
    await login(page);

    // Capture the corrupted token we're about to install so we can verify
    // the store no longer contains it after the 401-retry path completes.
    const corruptedToken = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('zm-auth')!);
      const broken = raw.state.accessToken.slice(0, -10) + 'AAAAAAAAAA';
      raw.state.accessToken = broken;
      localStorage.setItem('zm-auth', JSON.stringify(raw));
      return broken;
    });

    // Navigate to a page that fires API calls; the 401-retry path should
    // refresh transparently.
    await page.goto('/events');
    await page.waitForLoadState('networkidle');

    const currentToken = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('zm-auth')!).state;
      return raw.accessToken;
    });

    expect(currentToken, 'auth should not have been cleared').not.toBeNull();
    expect(currentToken, 'token should have been replaced by a fresh one')
      .not.toBe(corruptedToken);
    // Still on /events, not bounced to /login.
    await expect(page).toHaveURL(/\/events/);
  });

  test('bad credentials keep you on the form with an error @route:login', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('textbox', { name: /username/i }).fill('e2e-nobody');
    await page.getByRole('textbox', { name: /password/i }).fill('not-the-password');
    const resp = page.waitForResponse((r) => r.url().includes('/api/v3/auth/login'));
    await page.getByRole('button', { name: /^(sign in|login)$/i }).click();
    expect((await resp).ok()).toBe(false);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/login failed|invalid|unauthor/i).first()).toBeVisible();
  });
});
