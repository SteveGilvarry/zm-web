import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { ALL_PAGE_KEYS, ROUTES, routelessPageKeys } from './routes';

/**
 * The enforcement the test plan asks for: every page key the app can route to
 * must have at least one e2e spec, in each skin, tagged `@route:<key>` in its
 * title. Adding a page without a spec fails here rather than quietly shipping
 * an untested route.
 *
 * The key list is read from `src/skins/pageKeys.ts` — the same list the skin
 * registry checks itself against — so there is nothing to keep in sync.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TAG = /@route:([A-Za-z][A-Za-z0-9.]*)/g;

/** Every `@route:` tag in every spec, with the file it came from. */
function collectTags(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  for (const file of fs.readdirSync(HERE)) {
    if (!file.endsWith('.spec.ts') || file === 'route-coverage.spec.ts') continue;
    const source = fs.readFileSync(path.join(HERE, file), 'utf8');
    for (const [, key] of source.matchAll(TAG)) {
      if (!found.has(key)) found.set(key, new Set());
      found.get(key)!.add(file);
    }
  }
  return found;
}

test.describe('Route coverage', () => {
  test('every page key has at least one tagged spec', () => {
    const tagged = collectTags();
    const untagged = ALL_PAGE_KEYS.filter((key) => !tagged.has(key));
    expect(
      untagged,
      'These page keys have no e2e spec. Add one and tag its title `@route:<key>`.',
    ).toEqual([]);
  });

  test('every page key has a URL in the route table', () => {
    expect(
      routelessPageKeys(),
      'These page keys are not in e2e/routes.ts, so the a11y and mobile sweeps skip them.',
    ).toEqual([]);
  });

  test('no spec tags a page key the app does not have', () => {
    const known = new Set<string>(ALL_PAGE_KEYS);
    const unknown = [...collectTags().entries()]
      .filter(([key]) => !known.has(key))
      .map(([key, files]) => `${key} (in ${[...files].join(', ')})`);
    expect(unknown, 'Stale @route: tags — the key was renamed or removed.').toEqual([]);
  });

  test('the route table and the page-key list are the same set', () => {
    expect([...ROUTES.map((r) => r.key)].sort()).toEqual([...ALL_PAGE_KEYS].sort());
  });
});
