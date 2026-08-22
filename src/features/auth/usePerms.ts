import { useMemo } from 'react';
import type { PermFeature, PermLevel } from '@/types';
import { useAuthStore } from '@/stores/auth';
import { effectivePerms, hasPerm, NO_PERMS, permLevel, permsFromUser, type EffectivePerms } from './perms';
import { useMe } from './useMe';

export interface Perms {
  /** `can('events', 'Edit')` — at least that level on that feature. */
  can: (feature: PermFeature, level: PermLevel) => boolean;
  /** The granted level for a feature. */
  level: (feature: PermFeature) => PermLevel;
  /** False when neither the token nor `/me` says anything (every feature then
   *  reads as Edit). */
  known: boolean;
  perms: EffectivePerms;
}

/**
 * The signed-in user's permissions.
 *
 * Two sources, in that order: the access token's `perms` claim answers
 * immediately on first paint, then `GET /me` replaces it once it resolves.
 * The claim is a snapshot taken at login, so without the second read an
 * admin's permission change would not reach the operator until they signed
 * in again. `/me` is missing on zm-api builds before that route existed —
 * there the claim is all there is, which is what shipped before.
 */
export function usePerms(): Perms {
  const user = useAuthStore((s) => s.user);
  const { data: me } = useMe();

  return useMemo(() => {
    const claimed = user ? effectivePerms(user) : NO_PERMS;
    const perms = me ? permsFromUser(me) : claimed;
    return {
      can: (feature, level) => hasPerm(perms, feature, level),
      level: (feature) => permLevel(perms, feature),
      known: perms.known,
      perms,
    };
  }, [user, me]);
}
