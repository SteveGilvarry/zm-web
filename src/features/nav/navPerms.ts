import type { PermFeature, PermLevel } from '@/types';
import { hasPerm, type EffectivePerms } from '@/features/auth/perms';

export interface NavRequirement {
  feature: PermFeature;
  level: PermLevel;
}

/**
 * Which permission a route needs before it appears in the nav — the legacy
 * navbar's `canView(...)` checks (`skins/classic/includes/functions.php`).
 * Longest prefix wins, so `/settings/ptz-controls` beats `/settings`.
 * Paths with no entry (Console, Monitors list) are always shown.
 */
const RULES: ReadonlyArray<[prefix: string, req: NavRequirement]> = [
  ['/settings/ptz-controls', { feature: 'control', level: 'View' }],
  ['/settings', { feature: 'system', level: 'View' }],
  ['/logs', { feature: 'system', level: 'View' }],
  // Legacy shows Groups on canView('Groups'), its own column, not System.
  ['/groups', { feature: 'groups', level: 'View' }],
  ['/events', { feature: 'events', level: 'View' }],
  ['/filters', { feature: 'events', level: 'View' }],
  ['/audit', { feature: 'events', level: 'View' }],
  ['/reports', { feature: 'events', level: 'View' }],
  ['/montage', { feature: 'stream', level: 'View' }],
  ['/montagereview', { feature: 'stream', level: 'View' }],
  ['/cycle', { feature: 'stream', level: 'View' }],
];

function matches(prefix: string, path: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** The permission a nav path needs, or null when it is always visible. */
export function navRequirement(path: string): NavRequirement | null {
  let best: [string, NavRequirement] | null = null;
  for (const rule of RULES) {
    if (matches(rule[0], path) && (!best || rule[0].length > best[0].length)) best = rule;
  }
  // Watch pages are live streams.
  if (!best && /^\/monitors\/\d+$/.test(path)) return { feature: 'stream', level: 'View' };
  return best ? best[1] : null;
}

export function canSeeNav(perms: EffectivePerms, path: string): boolean {
  const req = navRequirement(path);
  return req ? hasPerm(perms, req.feature, req.level) : true;
}
