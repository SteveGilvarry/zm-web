import { ALL_PAGE_KEYS } from '../src/skins/pageKeys';
import { SEED } from './seed/seed-data';

/**
 * Every routed page, keyed by the same `PageKey` the skin registry uses, with
 * a URL that resolves against the seeded fixtures. One table drives three
 * things, so they can never drift apart:
 *
 *   - `a11y.spec.ts` — axe over every route in both skins,
 *   - `mobile.spec.ts` — the 390 px subset,
 *   - `route-coverage.spec.ts` — the check that each key has a tagged spec.
 *
 * `ALL_PAGE_KEYS` is imported (not copied) so adding a page key without a URL
 * here fails the coverage test rather than silently going untested.
 */
export type PageKey = (typeof ALL_PAGE_KEYS)[number];

export interface RouteEntry {
  key: PageKey;
  /** Path to visit, with seeded ids substituted. */
  path: string;
  /** False for pages that are only reachable signed out (login). */
  auth: boolean;
}

export const ROUTES: readonly RouteEntry[] = [
  { key: 'login', path: '/login', auth: false },
  { key: 'console', path: '/', auth: true },
  { key: 'monitors.list', path: '/monitors', auth: true },
  { key: 'monitors.watch', path: `/monitors/${SEED.monitors.frontDoor}`, auth: true },
  { key: 'monitors.zones', path: `/monitors/${SEED.monitors.frontDoor}/zones`, auth: true },
  { key: 'montage', path: '/montage', auth: true },
  { key: 'montagereview', path: '/montagereview', auth: true },
  { key: 'cycle', path: '/cycle', auth: true },
  { key: 'events.list', path: '/events', auth: true },
  { key: 'events.detail', path: `/events/${SEED.events.withFrames[0]}`, auth: true },
  { key: 'events.frames', path: `/events/${SEED.events.withFrames[0]}/frames`, auth: true },
  { key: 'filters', path: '/filters', auth: true },
  { key: 'groups', path: '/groups', auth: true },
  { key: 'logs', path: '/logs', auth: true },
  { key: 'reports.list', path: '/reports', auth: true },
  { key: 'reports.detail', path: `/reports/${SEED.report}`, auth: true },
  { key: 'audit', path: '/audit', auth: true },
  { key: 'settings.options', path: '/settings', auth: true },
  { key: 'settings.users', path: '/settings/users', auth: true },
  { key: 'settings.servers', path: '/settings/servers', auth: true },
  { key: 'settings.storage', path: '/settings/storage', auth: true },
  { key: 'settings.state', path: '/settings/state', auth: true },
  { key: 'settings.ptzControls', path: '/settings/ptz-controls', auth: true },
];

/** Page keys the registry knows about but this table has no URL for. */
export function routelessPageKeys(): string[] {
  const known = new Set(ROUTES.map((r) => r.key as string));
  return ALL_PAGE_KEYS.filter((k) => !known.has(k));
}

export { ALL_PAGE_KEYS };
