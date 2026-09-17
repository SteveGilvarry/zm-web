import type { Page } from '@playwright/test';
import { test, expect, gotoSkin, SKINS, seededOnly, apiFetch, type Skin } from './fixtures';
import { SEED } from './seed/seed-data';

/**
 * The same three affordances in two shapes. Modern lists groups with a
 * per-row Edit and Delete button and a Members panel beside them; classic
 * is legacy `?view=groups` — Mark / Name / Monitors, where the name itself
 * is the edit link, New and Delete sit in the toolbar, and deleting means
 * ticking a row first.
 */
const UI = {
  modern: {
    newGroup: (p: Page) => p.getByRole('button', { name: /^new group$/i }),
    edit: (p: Page, name: string) => p.getByRole('button', { name: `Edit group ${name}` }),
    del: async (p: Page, name: string) => {
      p.once('dialog', (d) => void d.accept());
      await p.getByRole('button', { name: `Delete group ${name}` }).click();
    },
    membersLabel: /members/i,
  },
  classic: {
    newGroup: (p: Page) => p.getByRole('button', { name: /^new$/i }),
    // Legacy prints "Id Name" and hangs the edit dialog off it.
    edit: (p: Page, name: string) => p.getByRole('button', { name: new RegExp(`\\d+ ${name}$`) }),
    del: async (p: Page, name: string) => {
      await p.getByRole('checkbox', { name: `Mark ${name}` }).check();
      p.once('dialog', (d) => void d.accept());
      await p.getByRole('button', { name: /^delete$/i }).click();
    },
    membersLabel: /monitors/i,
  },
} satisfies Record<Skin, unknown>;

/**
 * Groups (`/groups`) in both skins. The seed has `e2e-Outdoor` (three
 * monitors) with the child `e2e-Front` (one), so the nesting the legacy UI
 * shows with an arrow is exercised as well as the flat list.
 *
 * The CRUD test creates its own `e2e-probe-*` group and deletes it, so it can
 * run beside the other projects without touching fixture rows.
 */
test.describe('Groups', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: lists the seeded groups with their monitor counts @route:groups`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/groups', skin);

      await expect(page.getByText('e2e-Outdoor').first()).toBeVisible();
      await expect(page.getByText('e2e-Front').first()).toBeVisible();
      // Both skins let an operator open a group for editing by its name.
      await expect(UI[skin].edit(page, 'e2e-Outdoor')).toBeVisible();
      // …and both say somewhere which monitors are in it.
      await expect(page.getByText(UI[skin].membersLabel).first()).toBeVisible();
    });

    test(`${skin}: create and delete a group round-trips @route:groups`, async ({
      loggedInPage: page,
    }, testInfo) => {
      const name = `e2e-probe-${testInfo.project.name}-${skin}-${Date.now()}`;
      await gotoSkin(page, '/groups', skin);

      // Wait for the list before touching the toolbar: both skins re-render
      // when the groups query lands, which would blank a half-typed field.
      await expect(page.getByText('e2e-Outdoor').first()).toBeVisible();

      await UI[skin].newGroup(page).click();
      const dialog = page.getByRole('dialog', { name: /create group/i });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('Name', { exact: true }).fill(name);

      const created = page.waitForResponse(
        (r) => r.url().endsWith('/api/v3/groups') && r.request().method() === 'POST',
        { timeout: 15_000 },
      );
      await dialog.getByRole('button', { name: /^save$/i }).click();
      const createResp = await created;
      expect(createResp.status()).toBe(201);
      const id = (await createResp.json()).id as number;

      try {
        await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });

        const deleted = page.waitForResponse(
          (r) => r.url().endsWith(`/api/v3/groups/${id}`) && r.request().method() === 'DELETE',
          { timeout: 15_000 },
        );
        await UI[skin].del(page, name);
        await deleted;
        await expect(page.getByText(name)).toHaveCount(0, { timeout: 10_000 });
      } finally {
        // Belt and braces: never leave a probe row behind on a failure.
        await apiFetch(page, `/api/v3/groups/${id}`, { method: 'DELETE' });
      }
    });

    test(`${skin}: the seeded parent still reports three monitors @route:groups`, async ({
      loggedInPage: page,
    }) => {
      const listed = page.waitForResponse(
        (r) => /\/api\/v3\/groups(\?|$)/.test(r.url()) && r.request().method() === 'GET',
      );
      await gotoSkin(page, '/groups', skin);
      const body = (await (await listed).json()) as {
        items: Array<{ id: number; name: string; parent_id: number | null }>;
      };
      const outdoor = body.items.find((g) => g.id === SEED.groups.outdoor);
      const front = body.items.find((g) => g.id === SEED.groups.front);
      expect(outdoor?.name).toBe('e2e-Outdoor');
      expect(front?.parent_id).toBe(SEED.groups.outdoor);
    });
  }
});
