import type { PermFeature, PermLevel, User, UserClaims, UserPerms } from '@/types';

/** Ordering of permission levels; higher grants everything below it. */
const RANK: Record<PermLevel, number> = { None: 0, View: 1, Edit: 2, Create: 3 };

export const PERM_FEATURES: readonly PermFeature[] = [
  'stream',
  'events',
  'control',
  'monitors',
  'groups',
  'devices',
  'snapshots',
  'system',
];

export function isPermLevel(value: unknown): value is PermLevel {
  return typeof value === 'string' && value in RANK;
}

/** `true` when `granted` is at least `required`. */
export function levelSatisfies(granted: PermLevel, required: PermLevel): boolean {
  return RANK[granted] >= RANK[required];
}

/**
 * A user's effective permission set.
 *
 * `known` is false when the token carries no `perms` claim at all (a zm-api
 * build from before RBAC). In that case every feature reads as `Edit`: the
 * backend is still the real gate, and hiding the whole nav on an older server
 * would be a regression, not a safety gain. When the claim is present, a
 * feature it does not list is `None`.
 */
export interface EffectivePerms {
  known: boolean;
  levels: UserPerms;
}

const ALL_EDIT: UserPerms = {
  stream: 'Edit',
  events: 'Edit',
  control: 'Edit',
  monitors: 'Edit',
  groups: 'Edit',
  devices: 'Edit',
  snapshots: 'Edit',
  system: 'Edit',
};

const ALL_NONE: UserPerms = {
  stream: 'None',
  events: 'None',
  control: 'None',
  monitors: 'None',
  groups: 'None',
  devices: 'None',
  snapshots: 'None',
  system: 'None',
};

export function effectivePerms(claims: Pick<UserClaims, 'perms'> | null | undefined): EffectivePerms {
  const raw = claims?.perms;
  if (!raw || typeof raw !== 'object') return { known: false, levels: ALL_EDIT };
  const levels: UserPerms = { ...ALL_NONE };
  for (const feature of PERM_FEATURES) {
    const value = raw[feature];
    if (isPermLevel(value)) levels[feature] = value;
  }
  return { known: true, levels };
}

/**
 * The same set read off a `UserResponse` row (`GET /me`, `/users/{id}`),
 * where the 8 permission columns are top-level strings. This is the live
 * value; `effectivePerms()` reads the login-time snapshot in the token.
 */
export function permsFromUser(user: Pick<User, PermFeature>): EffectivePerms {
  const levels: UserPerms = { ...ALL_NONE };
  for (const feature of PERM_FEATURES) {
    const value = user[feature];
    if (isPermLevel(value)) levels[feature] = value;
  }
  return { known: true, levels };
}

/** No user at all: nothing is permitted. */
export const NO_PERMS: EffectivePerms = { known: true, levels: ALL_NONE };

export function permLevel(perms: EffectivePerms, feature: PermFeature): PermLevel {
  return perms.levels[feature];
}

export function hasPerm(perms: EffectivePerms, feature: PermFeature, level: PermLevel): boolean {
  return levelSatisfies(perms.levels[feature], level);
}
