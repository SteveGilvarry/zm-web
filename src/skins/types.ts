import type { ComponentType, LazyExoticComponent, ReactNode } from 'react';

/**
 * Skin system contract.
 *
 * A skin is a self-contained package under `src/skins/<id>/` that provides:
 *   - a `Shell` (the chrome around every page: nav, header, stat strip),
 *   - one page component per `PageKey`, auto-discovered from `pages/*.tsx`
 *     (filename = page key, default export = component, loaded lazily),
 *   - a `rootClass` applied to <html> that binds the design tokens
 *     (`--color-*`, fonts, radii) for that skin.
 *
 * Data fetching, mutations and domain logic live in `src/features/**` hooks
 * and are shared by every skin; a skin only decides layout and styling.
 * A page a skin does not implement falls back to the `fallbackSkin`'s page —
 * loudly (dev warning + `data-skin-fallback`) so the gap is never invisible.
 * See `src/skins/README.md`.
 */

export type SkinId = 'modern' | 'classic';

export type ColorScheme = 'light' | 'dark';

/** Every routed page in the app. Add here first, then to each skin's pages/. */
export type PageKey =
  | 'login'
  | 'console'
  | 'monitors.list'
  | 'monitors.watch'
  | 'monitors.zones'
  | 'montage'
  | 'montagereview'
  | 'cycle'
  | 'events.list'
  | 'events.detail'
  | 'filters'
  | 'groups'
  | 'logs'
  | 'reports.list'
  | 'reports.detail'
  | 'audit'
  | 'settings.options'
  | 'settings.users'
  | 'settings.servers'
  | 'settings.storage'
  | 'settings.state'
  | 'settings.ptzControls';

/** Props a route passes into a page. Pages without params take `{}`. */
export interface PagePropsMap {
  login: Record<never, never>;
  console: Record<never, never>;
  'monitors.list': Record<never, never>;
  'monitors.watch': { monitorId: number };
  'monitors.zones': { monitorId: number };
  montage: Record<never, never>;
  montagereview: Record<never, never>;
  cycle: Record<never, never>;
  'events.list': Record<never, never>;
  'events.detail': { eventId: number };
  filters: Record<never, never>;
  groups: Record<never, never>;
  logs: Record<never, never>;
  'reports.list': Record<never, never>;
  'reports.detail': { reportId: number };
  audit: Record<never, never>;
  'settings.options': Record<never, never>;
  'settings.users': Record<never, never>;
  'settings.servers': Record<never, never>;
  'settings.storage': Record<never, never>;
  'settings.state': Record<never, never>;
  'settings.ptzControls': Record<never, never>;
}

export type PageComponent<K extends PageKey> = ComponentType<PagePropsMap[K]>;

/** A dynamic import of a page module: `() => import('./pages/events.list')`. */
export type PageLoader<K extends PageKey = PageKey> = () => Promise<{
  default: PageComponent<K>;
}>;

export type PageLoaders = { [K in PageKey]?: PageLoader<K> };

/** Lazy page components, created once at discovery time (one chunk each). */
export type PageComponents = { [K in PageKey]?: LazyExoticComponent<PageComponent<K>> };

export interface ShellProps {
  /** Page title for the header / document title. */
  title?: string;
  children: ReactNode;
}

export interface SkinDefinition {
  id: SkinId;
  /** Human name shown in Settings → Appearance. */
  name: string;
  /** One-line description shown in Settings → Appearance. */
  description: string;
  /** Class put on <html> while this skin is active; binds its tokens. */
  rootClass: string;
  /** Colour schemes the skin's tokens support. */
  colorSchemes: readonly ColorScheme[];
  Shell: ComponentType<ShellProps>;
  pages: PageComponents;
}
