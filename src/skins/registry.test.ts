import { describe, expect, it } from 'vitest';
import { fallbackSkinId, isSkinId, missingPages, resolvePage, skins } from './registry';
import { ALL_PAGE_KEYS } from './pageKeys';
import type { PageKey } from './types';

/**
 * Pages the classic skin still borrows from the fallback skin. This list only
 * ever shrinks: give classic its own page, then delete the key here. Adding a
 * key means a new page shipped without a classic layout — do that knowingly.
 */
const CLASSIC_BORROWS: readonly PageKey[] = [
  'login',
  'monitors.zones',
  'montagereview',
  'events.detail',
  'filters',
  'logs',
  'reports.list',
  'reports.detail',
];

describe('skin registry', () => {
  it('knows both skins and rejects unknown ids', () => {
    expect(isSkinId('modern')).toBe(true);
    expect(isSkinId('classic')).toBe(true);
    expect(isSkinId('neon')).toBe(false);
    expect(isSkinId(undefined)).toBe(false);
  });

  it('the fallback skin implements every page key', () => {
    expect(missingPages(fallbackSkinId, ALL_PAGE_KEYS)).toEqual([]);
  });

  it('no skin ships a page that is not a known key', () => {
    for (const skin of Object.values(skins)) {
      const unknown = Object.keys(skin.pages).filter(
        (k) => !ALL_PAGE_KEYS.includes(k as PageKey),
      );
      expect(unknown, `${skin.id} has pages with unknown keys`).toEqual([]);
    }
  });

  it('classic borrows exactly the allow-listed pages from the fallback', () => {
    const missing = missingPages('classic', ALL_PAGE_KEYS);
    expect([...missing].sort()).toEqual([...CLASSIC_BORROWS].sort());
  });

  it('resolvePage prefers the skin’s own page and marks borrowed ones', () => {
    const own = resolvePage(skins.classic, 'cycle');
    expect(own.ownPage).toBe(true);
    expect(own.from).toBe('classic');

    const borrowed = resolvePage(skins.classic, CLASSIC_BORROWS[0]);
    expect(borrowed.ownPage).toBe(false);
    expect(borrowed.from).toBe(fallbackSkinId);
    expect(borrowed.Page).toBeDefined();
  });
});
