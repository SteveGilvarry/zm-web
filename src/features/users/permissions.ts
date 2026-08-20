import type { ReactNode } from 'react';
import i18next from '@/i18n';

/**
 * The eight top-level permission keys ZoneMinder grades a user on.
 * Order matches the legacy UI so the read-only display lines up with
 * what operators expect after migrating from the PHP skin.
 */
export const PERMISSION_NAMES = [
  'stream',
  'events',
  'control',
  'monitors',
  'groups',
  'devices',
  'snapshots',
  'system',
] as const;

export type PermissionName = (typeof PERMISSION_NAMES)[number];

/** Three-level permission options used by every permission except `monitors`. */
export const LEVEL_OPTIONS = ['None', 'View', 'Edit'] as const;

/** Four-level options — `monitors` adds `Create`. */
export const MONITOR_LEVEL_OPTIONS = ['None', 'View', 'Edit', 'Create'] as const;

/** Levels used by per-group / per-monitor matrices (`Inherit` falls back to global). */
export const INHERIT_LEVEL_OPTIONS = ['Inherit', 'None', 'View', 'Edit'] as const;

/** Pretty label for each top-level permission. Built per call so `t()` sees literal keys. */
function nameLabels(): Record<PermissionName, string> {
  const t = i18next.t.bind(i18next);
  return {
    stream: t('Stream'),
    events: t('Events'),
    control: t('Control'),
    monitors: t('Monitors'),
    groups: t('Groups'),
    devices: t('Devices'),
    snapshots: t('Snapshots'),
    system: t('System'),
  };
}

function nameHints(): Record<PermissionName, string> {
  const t = i18next.t.bind(i18next);
  return {
    stream: t('Live view'),
    events: t('Recorded events'),
    control: t('PTZ'),
    monitors: t('Cameras (Create adds new ones)'),
    groups: t('Group definitions'),
    devices: t('X10 / device admin'),
    snapshots: t('Snapshot capture'),
    system: t('Options, users, servers, storage'),
  };
}

export interface PermissionMatrixRow {
  /** Stable key for React reconciliation. */
  key: string;
  /** Label shown in the leftmost (sticky) column. */
  label: string;
  /** Optional sub-label rendered under `label` in a muted style. */
  sublabel?: string;
  /** Current selected level for this row. */
  value: string;
  /** Allowed levels for this row (e.g. `monitors` includes `Create`). */
  options: readonly string[];
  /** Optional right-most cell rendered in a separate column. */
  trailing?: ReactNode;
}

/**
 * Build the rows for the top-level 8-permission grid from a `UserResponse`.
 * Used as a read-only display today because `CreateUserRequest` /
 * `UpdateUserRequest` don't accept these fields (see CLAUDE.md / users.md).
 */
export function buildTopLevelRows(
  user: { stream: string; events: string; control: string; monitors: string;
          groups: string; devices: string; snapshots: string; system: string },
): PermissionMatrixRow[] {
  const valueOf: Record<PermissionName, string> = {
    stream: user.stream,
    events: user.events,
    control: user.control,
    monitors: user.monitors,
    groups: user.groups,
    devices: user.devices,
    snapshots: user.snapshots,
    system: user.system,
  };
  const labels = nameLabels();
  const hints = nameHints();
  return PERMISSION_NAMES.map((name) => ({
    key: name,
    label: labels[name],
    sublabel: hints[name],
    value: valueOf[name] || 'None',
    // Stream is technically None/View only in legacy, but the backend
    // stores a free string. We render the same 4-column header
    // everywhere and just hide cells that aren't valid for the row.
    options:
      name === 'monitors'
        ? MONITOR_LEVEL_OPTIONS
        : name === 'stream'
        ? (['None', 'View'] as const)
        : LEVEL_OPTIONS,
  }));
}

/* ----- Effective permission helper -------------------------------------- */

const RANK: Record<string, number> = { None: 0, View: 1, Edit: 2, Create: 3 };

/**
 * Compute the effective permission level for a user on a single monitor,
 * mirroring legacy `Monitor::effectivePermission($user)`.
 *
 * 1. If the per-monitor permission is non-`Inherit` → use it.
 * 2. Else walk each group the monitor belongs to; if any non-`Inherit` →
 *    use the most permissive (highest rank).
 * 3. Else fall back to the global `monitors` level.
 *
 * Pure function — no I/O, no side effects, fully unit-testable.
 */
export function computeEffectivePermission(args: {
  /** The per-monitor permission for this user, or `Inherit` if no row. */
  monitorPermission: string;
  /** Group ids the monitor is a member of. */
  groupIds: number[];
  /** Per-group permission map for this user; missing keys = Inherit. */
  groupPermissions: Record<number, string>;
  /** Global top-level `monitors` permission for this user. */
  globalMonitors: string;
}): string {
  const { monitorPermission, groupIds, groupPermissions, globalMonitors } = args;
  if (monitorPermission && monitorPermission !== 'Inherit') {
    return monitorPermission;
  }
  let best: string | null = null;
  let bestRank = -1;
  for (const gid of groupIds) {
    const p = groupPermissions[gid];
    if (!p || p === 'Inherit') continue;
    const r = RANK[p] ?? -1;
    if (r > bestRank) {
      bestRank = r;
      best = p;
    }
  }
  if (best !== null) return best;
  return globalMonitors || 'None';
}
