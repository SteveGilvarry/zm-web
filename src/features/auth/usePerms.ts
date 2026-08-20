import { useMemo } from 'react';
import type { PermFeature, PermLevel } from '@/types';
import { useAuthStore } from '@/stores/auth';
import { effectivePerms, hasPerm, NO_PERMS, permLevel, type EffectivePerms } from './perms';

export interface Perms {
  /** `can('events', 'Edit')` — at least that level on that feature. */
  can: (feature: PermFeature, level: PermLevel) => boolean;
  /** The granted level for a feature. */
  level: (feature: PermFeature) => PermLevel;
  /** False when the token predates RBAC (every feature then reads as Edit). */
  known: boolean;
  perms: EffectivePerms;
}

/**
 * The signed-in user's permissions, decoded from the access token's `perms`
 * claim. Selects only `user` from the auth store so token refreshes that
 * keep the same claims do not re-render callers.
 */
export function usePerms(): Perms {
  const user = useAuthStore((s) => s.user);
  return useMemo(() => {
    const perms = user ? effectivePerms(user) : NO_PERMS;
    return {
      can: (feature, level) => hasPerm(perms, feature, level),
      level: (feature) => permLevel(perms, feature),
      known: perms.known,
      perms,
    };
  }, [user]);
}
