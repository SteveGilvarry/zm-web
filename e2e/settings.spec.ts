import type { Page } from '@playwright/test';
import { test, expect, gotoSkin, SKINS, seededOnly, apiFetch, type Skin } from './fixtures';
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

      if (skin === 'modern') {
        // Appearance (the skin chooser) is on this page.
        await expect(page.getByRole('heading', { name: /appearance/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /^Modern/ })).toBeVisible();
        await expect(page.getByRole('button', { name: /classic zoneminder/i })).toBeVisible();
      } else {
        // Classic opens on System, as legacy does; the skin is on This Session.
        await expect(page.getByRole('form', { name: 'Options' })).toBeVisible();
        await page.getByRole('button', { name: 'This Session', exact: true }).click();
        await expect(page.getByLabel('Skin', { exact: true })).toHaveValue('classic');
      }

      // The seeded ZM_E2E_* config rows are reachable from the category rail.
      await page
        .getByRole('button', { name: /^paths/i })
        .or(page.getByRole('link', { name: /^paths$/i }))
        .first()
        .click();
      if (skin === 'modern') {
        await expect(page.getByText('ZM_E2E_DIR_EVENTS').first()).toBeVisible();
      } else {
        // Legacy labels each option by its name without ZM_, input in place.
        await expect(page.getByLabel('E2E_DIR_EVENTS', { exact: true })).toBeVisible();
      }
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
      await expect(
        skin === 'classic'
          ? page.getByRole('button', { name: 'e2e-server-1', exact: true })
          : page.getByRole('button', { name: /^edit e2e-server-1$/i }),
      ).toBeVisible();
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

      // Classic opens legacy's server modal from Add New Server; modern's
      // register form sits under the table.
      const form = skin === 'classic' ? page.getByRole('dialog', { name: 'New Server' }) : page;
      if (skin === 'classic') await page.getByRole('button', { name: 'Add New Server' }).click();
      const nameField = form.getByLabel('Name', { exact: true });
      await nameField.fill(name);
      await expect(nameField).toHaveValue(name);
      // Modern labels the field Host, classic (legacy wording) Hostname.
      await form.getByLabel(/^host(name)?$/i).first().fill('probe.example.test');

      const created = page.waitForResponse(
        (r) => r.url().endsWith('/api/v3/servers') && r.request().method() === 'POST',
        { timeout: 15_000 },
      );
      await form.getByRole('button', { name: skin === 'classic' ? /^save$/i : /^register$/i }).click();
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
        if (skin === 'classic') {
          // Legacy: mark the row, then the toolbar's Delete.
          await page.getByRole('checkbox', { name: `Mark ${name}` }).check();
          await page.getByRole('button', { name: 'Delete', exact: true }).click();
        } else {
          await page.getByRole('button', { name: `Delete ${name}` }).click();
        }
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

  /**
   * Modern gives each row an Edit button; classic is legacy `?view=options`
   * → Storage, where the name itself opens the form and the toolbar's single
   * Delete acts on whatever is marked.
   */
  const editStorage = (p: Page, skin: Skin, name: string) =>
    skin === 'classic'
      ? p.getByRole('button', { name, exact: true })
      : p.getByRole('button', { name: `Edit ${name}`, exact: true });

  for (const skin of SKINS) {
    test(`${skin}: lists both storage areas with their paths @route:settings.storage`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/settings/storage', skin);

      await expect(page.getByRole('row', { name: /e2e-events/ })).toContainText(
        '/var/cache/zoneminder/events-e2e',
      );
      await expect(page.getByRole('row', { name: /\bDefault\b/ }).first()).toBeVisible();
      await expect(editStorage(page, skin, 'e2e-events')).toBeVisible();
    });

    test(`${skin}: editing a storage area opens its form @route:settings.storage`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/settings/storage', skin);
      await editStorage(page, skin, 'e2e-events').click();
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
      await page.getByRole('button', { name: /, show definition of e2e-night$/i }).click();
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
      // The stock Pelco-D copy drives the PelcoD protocol. (No Type column:
      // ZoneMinder 1.39.39 dropped it.)
      await expect(row).toContainText('PelcoD');
      await expect(row).not.toContainText('Ffmpeg');
      // Everything else is filtered out.
      await expect(page.getByRole('row', { name: /^HikVision/ })).toHaveCount(0);
    });
  }
});

test.describe('Settings — API access', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: lists every user with its API toggles @route:settings.apiTokens`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/settings/api-tokens', skin);

      // One row per user, with the two things `PUT /users/{id}` can change.
      // Nothing is clicked: revoking would sign the seeded accounts out from
      // under the other workers.
      await expect(
        page.getByRole('checkbox', { name: `API enabled for ${SEED.viewer.username}` }),
      ).toBeVisible();
      await expect(
        page.getByRole('checkbox', { name: `Revoke tokens for ${SEED.admin.username}` }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /revoke all tokens/i })).toBeVisible();
    });
  }
});

test.describe('Settings — AI', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  /**
   * The AI tabs read `/ai/datasets`, `/ai/models` and `/ai/object-classes`.
   * Nothing here is seeded in the 9000 range: the rows are the ones
   * ZoneMinder's own schema ships (the COCO dataset and its classes), which
   * is what a fresh install shows too.
   */
  for (const skin of SKINS) {
    test(`${skin}: the datasets tab lists the stock dataset @route:settings.ai`, async ({
      loggedInPage: page,
    }) => {
      const listed = page.waitForResponse(
        (r) => /\/api\/v3\/ai\/datasets(\?|$)/.test(r.url()) && r.request().method() === 'GET',
        { timeout: 15_000 },
      );
      await gotoSkin(page, '/settings/ai/datasets', skin);
      expect((await listed).status()).toBe(200);

      await expect(page.getByRole('row', { name: /COCO/ }).first()).toBeVisible();
    });

    test(`${skin}: the tabs switch section and endpoint @route:settings.ai`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/settings/ai/datasets', skin);

      const classes = page.waitForResponse(
        (r) => /\/api\/v3\/ai\/object-classes(\?|$)/.test(r.url()) && r.request().method() === 'GET',
        { timeout: 15_000 },
      );
      // Modern has its own tab strip ("Object Classes"); classic reaches the
      // same page through the legacy Options rail ("AI Classes").
      await page
        .getByRole('link', { name: skin === 'classic' ? /^ai classes$/i : /^object classes$/i })
        .click();
      expect((await classes).status()).toBe(200);
      await expect(page).toHaveURL(/\/settings\/ai\/classes/);
      // The classes tab scopes itself to one dataset.
      await expect(page.getByLabel(/filter by dataset/i)).toBeVisible();
    });
  }
});

/**
 * The wave-2 admin pages (roles, encoder templates, menu, privacy). Nothing
 * here needs seeded rows: each page is opened in both skins and its primary
 * control has to be there, which also holds on a live box.
 */
test.describe('Settings — roles', () => {
  for (const skin of SKINS) {
    test(`${skin}: the roles list offers a new role @route:settings.roles`, async ({ loggedInPage: page }) => {
      await gotoSkin(page, '/settings/roles', skin);
      await expect(
        page.getByRole('button', { name: skin === 'classic' ? /^add new role$/i : /^add role$/i }),
      ).toBeVisible();
    });

    test(`${skin}: a new role opens an empty editor @route:settings.roles.edit`, async ({ loggedInPage: page }) => {
      await gotoSkin(page, '/settings/roles/new', skin);
      await expect(page.getByRole('textbox', { name: /^name$/i })).toHaveValue('');
      await expect(
        page.getByRole('button', { name: skin === 'classic' ? /^back$/i : /^back to roles$/i }),
      ).toBeVisible();
    });
  }
});

test.describe('Settings — encoder templates', () => {
  for (const skin of SKINS) {
    test(`${skin}: the template list offers a new template @route:settings.encoderTemplates`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/settings/encoder-templates', skin);
      await expect(
        page.getByRole('button', { name: skin === 'classic' ? /^add new template$/i : /^add template$/i }),
      ).toBeVisible();
    });
  }
});

test.describe('Settings — menu', () => {
  for (const skin of SKINS) {
    test(`${skin}: the menu editor can add an entry @route:settings.menu`, async ({ loggedInPage: page }) => {
      await gotoSkin(page, '/settings/menu', skin);
      await expect(
        page.getByRole('button', { name: skin === 'classic' ? /^add$/i : /^add entry$/i }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /^save$/i })).toBeVisible();
    });
  }
});

test.describe('Settings — privacy', () => {
  for (const skin of SKINS) {
    test(`${skin}: the privacy notice asks for an answer @route:settings.privacy`, async ({ loggedInPage: page }) => {
      await gotoSkin(page, '/settings/privacy', skin);
      // Nothing is answered: that would change ZM_SHOW_PRIVACY for everyone.
      if (skin === 'classic') {
        await expect(page.getByRole('combobox', { name: /privacy/i })).toBeVisible();
      } else {
        await expect(page.getByRole('button', { name: /^accept$/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /^decline$/i })).toBeVisible();
      }
    });
  }
});
