import { clsx } from 'clsx';

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

/** Pretty label for each top-level permission. */
const NAME_LABELS: Record<PermissionName, string> = {
  stream: 'Stream',
  events: 'Events',
  control: 'Control',
  monitors: 'Monitors',
  groups: 'Groups',
  devices: 'Devices',
  snapshots: 'Snapshots',
  system: 'System',
};

const NAME_HINTS: Record<PermissionName, string> = {
  stream: 'Live view',
  events: 'Recorded events',
  control: 'PTZ',
  monitors: 'Cameras (Create adds new ones)',
  groups: 'Group definitions',
  devices: 'X10 / device admin',
  snapshots: 'Snapshot capture',
  system: 'Options, users, servers, storage',
};

interface PermissionMatrixRow {
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
  trailing?: React.ReactNode;
}

interface PermissionMatrixProps {
  /**
   * Rows × columns of radio inputs. Each row may have its own option set
   * — this lets us reuse the same component for the global 3/4-level grid
   * and the per-group / per-monitor `Inherit` grid.
   */
  rows: PermissionMatrixRow[];
  /** When `true`, all radios are disabled (read-only display). */
  readOnly?: boolean;
  /**
   * Called with `(rowKey, newLevel)` when the user changes a radio. Not
   * called when `readOnly` is true.
   */
  onChange?: (rowKey: string, level: string) => void;
  /** Optional column header label for the trailing column. */
  trailingHeader?: string;
  /** Header label shown above the row label column. */
  rowHeader?: string;
}

/**
 * Generic permission grid: rows on the left, level radios across the
 * columns. Used three times in the user editor (global, per-group,
 * per-monitor). The component is presentation-only — load + save are
 * the parent's responsibility.
 */
export function PermissionMatrix({
  rows,
  readOnly = false,
  onChange,
  trailingHeader,
  rowHeader = 'Permission',
}: PermissionMatrixProps) {
  // Compute the union of all options across rows so we can render a
  // stable column for each — rows with a smaller option set will just
  // show a placeholder dash in the missing column.
  const allOptions: string[] = [];
  for (const row of rows) {
    for (const opt of row.options) {
      if (!allOptions.includes(opt)) allOptions.push(opt);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-left">
            <th className="px-3 py-2 font-medium text-text-muted">{rowHeader}</th>
            {allOptions.map((opt) => (
              <th key={opt} className="px-3 py-2 font-medium text-text-muted text-center">
                {opt}
              </th>
            ))}
            {trailingHeader && (
              <th className="px-3 py-2 font-medium text-text-muted text-left">{trailingHeader}</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {rows.map((row) => (
            <tr key={row.key} className="hover:bg-panel/40 transition-colors">
              <td className="px-3 py-2 align-top">
                <div className="text-text-primary font-medium">{row.label}</div>
                {row.sublabel && (
                  <div className="text-[11px] text-text-muted mt-0.5">{row.sublabel}</div>
                )}
              </td>
              {allOptions.map((opt) => {
                const available = row.options.includes(opt);
                const checked = row.value === opt;
                if (!available) {
                  return (
                    <td key={opt} className="px-3 py-2 text-center text-text-dim">
                      —
                    </td>
                  );
                }
                return (
                  <td key={opt} className="px-3 py-2 text-center">
                    <label
                      className={clsx(
                        'inline-flex items-center justify-center',
                        readOnly && 'cursor-default opacity-80',
                        !readOnly && 'cursor-pointer',
                      )}
                    >
                      <input
                        type="radio"
                        name={`perm-${row.key}`}
                        aria-label={`${row.label}: ${opt}`}
                        value={opt}
                        checked={checked}
                        disabled={readOnly}
                        onChange={() => onChange?.(row.key, opt)}
                        className="accent-cyan w-4 h-4"
                      />
                    </label>
                  </td>
                );
              })}
              {trailingHeader && (
                <td className="px-3 py-2 align-top text-text-secondary">{row.trailing ?? null}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
  return PERMISSION_NAMES.map((name) => ({
    key: name,
    label: NAME_LABELS[name],
    sublabel: NAME_HINTS[name],
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
