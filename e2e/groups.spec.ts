import { test, expect, gotoSkin, SKINS, seededOnly, apiFetch } from './fixtures';
import { SEED } from './seed/seed-data';

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
      // Both skins offer per-group edit/delete affordances by name.
      await expect(page.getByRole('button', { name: /^edit group e2e-Outdoor$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^delete group e2e-Outdoor$/i })).toBeVisible();
      // Selecting a group shows its members.
      await expect(page.getByText(/members/i).first()).toBeVisible();
    });

    test(`${skin}: create and delete a group round-trips @route:groups`, async ({
      loggedInPage: page,
    }, testInfo) => {
      const name = `e2e-probe-${testInfo.project.name}-${skin}-${Date.now()}`;
      await gotoSkin(page, '/groups', skin);

      const created = page.waitForResponse(
        (r) => r.url().endsWith('/api/v3/groups') && r.request().method() === 'POST',
        { timeout: 15_000 },
      );
      page.once('dialog', (d) => void d.accept(name));
      await page.getByRole('button', { name: /^new group$/i }).click();
      // Skins that use an inline field rather than a prompt: fill it.
      const field = page.getByRole('textbox', { name: /group name/i });
      if (await field.count()) {
        await field.fill(name);
        await page.getByRole('button', { name: /^(create|save|add)$/i }).first().click();
      }
      const createResp = await created;
      expect(createResp.status()).toBe(201);
      const id = (await createResp.json()).id as number;

      try {
        await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });

        const deleted = page.waitForResponse(
          (r) => r.url().endsWith(`/api/v3/groups/${id}`) && r.request().method() === 'DELETE',
          { timeout: 15_000 },
        );
        page.once('dialog', (d) => void d.accept());
        await page.getByRole('button', { name: `Delete group ${name}` }).click();
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
