import { useUiStore } from '@/stores/ui';
import { modernSkin } from './modern';
import { classicSkin } from './classic';
import type { LazyExoticComponent } from 'react';
import type { PageComponent, PageKey, SkinDefinition, SkinId } from './types';

/**
 * Every skin the app knows about. Adding a skin = a folder under `src/skins/`
 * exporting a `SkinDefinition`, plus one line here.
 */
export const skins: Readonly<Record<SkinId, SkinDefinition>> = {
  modern: modernSkin,
  classic: classicSkin,
};

export const skinIds = Object.keys(skins) as SkinId[];

/**
 * The skin whose pages are used when the active skin has no page of its own.
 * Modern is the most complete implementation, so it backs the others.
 */
export const fallbackSkinId: SkinId = 'modern';

export const defaultSkinId: SkinId = 'modern';

export function isSkinId(value: unknown): value is SkinId {
  return typeof value === 'string' && value in skins;
}

export function getSkin(id: SkinId): SkinDefinition {
  return skins[id];
}

/** The active skin definition (reactive). */
export function useSkin(): SkinDefinition {
  const id = useUiStore((s) => s.skin);
  return skins[isSkinId(id) ? id : defaultSkinId];
}

/**
 * Resolve the page a skin renders for `key`: its own page, or the fallback
 * skin's. `ownPage` is false when borrowing — callers surface that in dev.
 */
export function resolvePage<K extends PageKey>(
  skin: SkinDefinition,
  key: K,
): {
  Page: LazyExoticComponent<PageComponent<K>> | undefined;
  ownPage: boolean;
  from: SkinId;
} {
  const own = skin.pages[key] as LazyExoticComponent<PageComponent<K>> | undefined;
  if (own) return { Page: own, ownPage: true, from: skin.id };
  const fallback = skins[fallbackSkinId].pages[key] as
    | LazyExoticComponent<PageComponent<K>>
    | undefined;
  return { Page: fallback, ownPage: false, from: fallbackSkinId };
}

/** Page keys a skin borrows from the fallback skin (for coverage reports). */
export function missingPages(skinId: SkinId, allKeys: readonly PageKey[]): PageKey[] {
  const skin = skins[skinId];
  return allKeys.filter((k) => !skin.pages[k]);
}
