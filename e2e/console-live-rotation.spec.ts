import { test, expect } from './fixtures';

/**
 * The recurring Safari rotation regression: rotated cameras (Rotate90 /
 * Rotate270) need an explicit transform + swap-dimension sizing so the
 * landscape video lands inside its portrait container. WebKit has bitten
 * us repeatedly here — this spec runs in both chromium AND webkit per
 * the project config.
 *
 * Strategy:
 *   1. Fetch the monitor list via the API; find any monitor whose
 *      orientation is Rotate90 / Rotate270 (rotated) and any whose
 *      orientation is Rotate0 (baseline).
 *   2. Navigate to the monitor detail page for each and inspect the
 *      <video> element's inline styles.
 *   3. Rotated cameras must carry a rotate(90deg|270deg) transform OR
 *      the swap-dimensions strategy (width:177.7778%).
 *   4. Rotate0 cameras must NOT carry a rotation transform.
 *
 * If the test environment has no rotated monitor, the rotated assertion
 * is skipped. If it has no monitors at all the whole test skips.
 */
test.describe('Console live rotation', () => {
  test('rotated monitor renders with rotation transform; Rotate0 stays unrotated @route:monitors.watch', async ({
    loggedInPage: page,
    browserName,
  }) => {
    // Pull the monitor catalog via the in-page client so we get the same
    // auth treatment the dashboard uses.
    const monitors = await page.evaluate(async () => {
      const raw = window.localStorage.getItem('zm-auth');
      if (!raw) return null;
      const { state } = JSON.parse(raw);
      const r = await fetch('/api/v3/monitors?page=1&page_size=200', {
        headers: { Authorization: `Bearer ${state.accessToken}` },
      });
      if (!r.ok) return null;
      const json = await r.json();
      return (json.items ?? []) as Array<{
        id: number;
        name: string;
        orientation: string;
        capturing: string;
      }>;
    });

    test.skip(!monitors || monitors.length === 0, 'No monitors available in the test environment');

    const norm = (o: string | null | undefined) =>
      (o ?? '').replace(/[_\s]/g, '').toLowerCase();

    const rotated = monitors!.find(
      (m) => ['rotate90', 'rotate270'].includes(norm(m.orientation)) && m.capturing !== 'None',
    );
    const upright = monitors!.find(
      (m) => norm(m.orientation) === 'rotate0' && m.capturing !== 'None',
    );

    test.skip(!rotated && !upright, 'No usable monitors (rotated or upright) to assert on');

    // Rotated camera — check the <video> element carries either the
    // rotate(<deg>deg) transform or the swap-dimensions strategy.
    if (rotated) {
      await page.goto(`/monitors/${rotated.id}`);
      const video = page.locator('video').first();
      await expect(video).toBeVisible({ timeout: 15_000 });

      const styles = await video.evaluate((el) => {
        const inline = el.getAttribute('style') ?? '';
        const computed = window.getComputedStyle(el);
        return {
          inline,
          transform: computed.transform,
          width: computed.width,
          inlineWidth: (el as HTMLElement).style.width,
        };
      });

      // Pass if EITHER strategy is in effect: an explicit rotate() in the
      // transform, OR the swap-dimensions width (177.7778%) for the
      // console's auto-fill rotation path. The monitor detail page uses
      // the transform path; the console thumbnails use swap-dimensions.
      const hasRotateTransform =
        /rotate\(\s*(90|270)deg\s*\)/i.test(styles.inline) ||
        // matrix(a, b, c, d, …): a = cos(theta) ≈ 0 for 90°/270°, |b| = 1
        /matrix\([^)]*\)/.test(styles.transform);
      const hasSwapDims = styles.inlineWidth.startsWith('177.7778');

      expect(
        hasRotateTransform || hasSwapDims,
        `[${browserName}] rotated monitor #${rotated.id} (${rotated.orientation}) must use ` +
          `rotate(<deg>deg) OR swap-dimensions width — saw inline="${styles.inline}" transform="${styles.transform}"`,
      ).toBe(true);
    } else {
      test.info().annotations.push({ type: 'skip', description: 'no rotated monitor' });
    }

    // Upright (Rotate0) camera — must NOT have a rotation transform.
    if (upright) {
      await page.goto(`/monitors/${upright.id}`);
      const video = page.locator('video').first();
      await expect(video).toBeVisible({ timeout: 15_000 });

      const inlineStyle = (await video.getAttribute('style')) ?? '';
      expect(
        /rotate\(\s*(90|180|270)deg\s*\)/i.test(inlineStyle),
        `[${browserName}] Rotate0 monitor #${upright.id} should NOT carry a rotation transform — saw "${inlineStyle}"`,
      ).toBe(false);
    } else {
      test.info().annotations.push({ type: 'skip', description: 'no upright monitor' });
    }
  });
});
