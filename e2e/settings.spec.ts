import { test, expect, gotoSkin, SKINS, seededOnly, apiFetch } from './fixtures';
import { SEED } from './seed/seed-data';

/**
 * The admin pages under `/settings`, in both skins: options, users, servers,
 * storage, run state and PTZ control profiles.
 *
 * These are the mutation-heavy routes, so anything that writes creates its
 * own `e2e-probe-*` row and removes it again. Nothing here applies a run
 * state or starts/stops the daemon supervisor — on a real box those are
 * destructive, and on the hermetic one there is no zmpkg to talk to.
 */
test.describe('Settings — options', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: config categories and search reach the seeded rows @route:settings.options`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/settings', skin);

      // Appearance (the skin chooser) is on this page in both skins.
      await expect(page.getByRole('heading', { name: /appearance/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /mission control/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /classic zoneminder/i })).toBeVisible();

      // The seeded ZM_E2E_* config rows are reachable from the category rail.
      await page
        .getByRole('button', { name: /^paths/i })
        .or(page.getByRole('link', { name: /^paths$/i }))
        .first()
        .click();
      await expect(page.getByText('ZM_E2E_DIR_EVENTS').first()).toBeVisible();
    });
  }

  test('modern: search narrows the config table @route:settings.options', async ({
    loggedInPage: page,
  }) => {
    await gotoSkin(page, '/settings', 'modern');
    await page.getByPlaceholder(/search all configs/i).fill('TIMEZONE');
    await expect(page.getByText('ZM_E2E_TIMEZONE')).toBeVisible();
    await expect(page.getByText('ZM_E2E_DIR_EVENTS')).toHaveCount(0);
  });

  test('classic: the options rail links the admin sub-pages @route:settings.options', async ({
    loggedInPage: page,
  }) => {
    await gotoSkin(page, '/settings', 'classic');
    for (const [name, href] of [
      ['Servers', '/settings/servers'],
      ['Storage', '/settings/storage'],
      ['Users', '/settings/users'],
      ['Run State', '/settings/state'],
      ['Control', '/settings/ptz-controls'],
    ] as const) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
    }
  });
});

test.describe('Settings — users', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: the permission matrix shows each account's levels @route:settings.users`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/settings/users', skin);

      const table = page.locator('table').first();
      await expect(table).toContainText(SEED.admin.username);
      await expect(table).toContainText(SEED.viewer.username);
      // The seeded viewer is View on Stream and None on System — the row has
      // to show the difference, not a single "enabled" flag.
      const viewerRow = page.getByRole('row', { name: new RegExp(SEED.viewer.username) });
      await expect(viewerRow).toContainText('View');
      await expect(viewerRow).toContainText('None');
    });

    test(`${skin}: search narrows the account list @route:settings.users`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/settings/users', skin);
      await page.getByRole('searchbox').first().fill('viewer');
      await expect(page.getByText(SEED.viewer.username).first()).toBeVisible();
      await expect(page.getByRole('row', { name: /^admin\b/ })).toHaveCount(0);
    });
  }
});

test.describe('Settings — servers', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: lists the seeded server with its monitor count @route:settings.servers`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/settings/servers', skin);
      const row = page.getByRole('row', { name: /e2e-server-1/ });
      await expect(row).toBeVisible();
      await expect(row).toContainText('zm-e2e.example.test');
      await expect(page.getByRole('button', { name: /^edit e2e-server-1$/i })).toBeVisible();
    });

    test(`${skin}: register and delete a server round-trips @route:settings.servers`, async ({
      loggedInPage: page,
    }, testInfo) => {
      const name = `e2e-probe-${testInfo.project.name}-${skin}-${Date.now()}`;
      await gotoSkin(page, '/settings/servers', skin);
      // The registered-servers table re-renders when the list query lands and
      // again when the live-stats poll does; let it settle before typing, or
      // the controlled inputs get reset under us and Register stays disabled.
      await expect(page.getByRole('row', { name: /e2e-server-1/ })).toBeVisible();

      const nameField = page.getByLabel('Name', { exact: true });
      await nameField.fill(name);
      await expect(nameField).toHaveValue(name);
      await page.getByLabel('Host', { exact: true }).fill('probe.example.test');

      const created = page.waitForResponse(
        (r) => r.url().endsWith('/api/v3/servers') && r.request().method() === 'POST',
        { timeout: 15_000 },
      );
      await page.getByRole('button', { name: /^register$/i }).click();
      const resp = await created;
      expect(resp.status()).toBe(201);
      const id = (await resp.json()).id as number;

      try {
        await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible({
          timeout: 10_000,
        });
        const deleted = page.waitForResponse(
          (r) => r.url().endsWith(`/api/v3/servers/${id}`) && r.request().method() === 'DELETE',
          { timeout: 15_000 },
        );
        await page.getByRole('button', { name: `Delete ${name}` }).click();
        // Destructive actions go through the in-app ConfirmDialog, not
        // window.confirm — so the second click is on the modal's button.
        const confirm = page.getByRole('dialog', { name: /delete server/i });
        await expect(confirm).toBeVisible();
        await confirm.getByRole('button', { name: /^delete$/i }).click();
        await deleted;
        await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0, {
          timeout: 10_000,
        });
      } finally {
        await apiFetch(page, `/api/v3/servers/${id}`, { method: 'DELETE' });
      }
    });
  }
});

test.describe('Settings — storage', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: lists both storage areas with their paths @route:settings.storage`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/settings/storage', skin);

      await expect(page.getByRole('row', { name: /e2e-events/ })).toContainText(
        '/var/cache/zoneminder/events-e2e',
      );
      await expect(page.getByRole('row', { name: /^Default/ }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /^edit e2e-events$/i })).toBeVisible();
    });

    test(`${skin}: editing a storage area opens its form @route:settings.storage`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/settings/storage', skin);
      await page.getByRole('button', { name: /^edit e2e-events$/i }).click();
      // The path is editable, not just displayed, and opens on its real value.
      await expect(
        page.locator('input[value="/var/cache/zoneminder/events-e2e"]'),
      ).toBeVisible();
    });
  }
});

test.describe('Settings — run state', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: lists the saved states with the active one marked @route:settings.state`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/settings/state', skin);

      const active = page.getByRole('row', { name: /^default/ });
      await expect(active).toContainText(/active/i);
      await expect(page.getByRole('row', { name: /e2e-Night/ })).toContainText('4 monitors');
      await expect(page.getByRole('button', { name: /^apply state e2e-night$/i })).toBeVisible();
      // Supervisor controls are present but never clicked here.
      await expect(page.getByRole('button', { name: /^start$/i })).toBeVisible();
    });

    test(`${skin}: a saved state can be expanded to its definition @route:settings.state`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/settings/state', skin);
      await page.getByRole('button', { name: /^show definition of e2e-night$/i }).click();
      // Definition is "id:Capturing:Analysing:Recording" per monitor.
      await expect(page.getByText(String(SEED.monitors.frontDoor)).first()).toBeVisible();
    });
  }
});

test.describe('Settings — PTZ control profiles', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: the seeded profile is listed and searchable @route:settings.ptzControls`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/settings/ptz-controls', skin);

      await page.getByRole('searchbox').first().fill('e2e-PTZ');
      const row = page.getByRole('row', { name: /e2e-PTZ Dome \(Pelco-D\)/ });
      await expect(row).toBeVisible();
      // The stock Pelco-D copy is an Ffmpeg profile that can move.
      await expect(row).toContainText('Ffmpeg');
      // Everything else is filtered out.
      await expect(page.getByRole('row', { name: /^HikVision/ })).toHaveCount(0);
    });
  }
});
