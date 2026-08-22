import type { PageKey } from './types';

/**
 * Runtime list of every page key (types cannot be enumerated at runtime).
 * Keep in sync with `PageKey` in `types.ts`; the registry test checks that
 * the fallback skin implements all of them.
 */
export const ALL_PAGE_KEYS: readonly PageKey[] = [
  'login',
  'console',
  'monitors.list',
  'monitors.watch',
  'monitors.zones',
  'montage',
  'montagereview',
  'cycle',
  'events.list',
  'events.detail',
  'events.frames',
  'filters',
  'groups',
  'logs',
  'reports.list',
  'reports.detail',
  'audit',
  'settings.options',
  'settings.users',
  'settings.servers',
  'settings.storage',
  'settings.state',
  'settings.ptzControls',
];
