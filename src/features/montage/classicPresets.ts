/**
 * Legacy ZM montage layout presets. Each `N Wide` preset means "N cells per
 * row"; the grid wraps to as many rows as the monitor count needs. `Auto`
 * picks a column count from the monitor count using the same heuristic as
 * `montage.php` (see legacy-requirements/montage.md, lines 87–95).
 *
 * `label` is the English source text; `MontageClassicGrid` renders it via
 * `t()` so the option list is translatable.
 */
export interface MontagePreset {
  id: string;
  label: string;
  /** Column count, or null for the Auto preset (computed from monitor count). */
  columns: number | null;
}

export const MONTAGE_PRESETS: readonly MontagePreset[] = [
  { id: 'auto',  label: 'Auto',     columns: null },
  { id: '1w',    label: '1 Wide',   columns: 1 },
  { id: '2w',    label: '2 Wide',   columns: 2 },
  { id: '3w',    label: '3 Wide',   columns: 3 },
  { id: '4w',    label: '4 Wide',   columns: 4 },
  { id: '5w',    label: '5 Wide',   columns: 5 },
  { id: '6w',    label: '6 Wide',   columns: 6 },
  { id: '8w',    label: '8 Wide',   columns: 8 },
  { id: '12w',   label: '12 Wide',  columns: 12 },
  { id: '16w',   label: '16 Wide',  columns: 16 },
  { id: '20w',   label: '20 Wide',  columns: 20 },
  { id: '24w',   label: '24 Wide',  columns: 24 },
  { id: '32w',   label: '32 Wide',  columns: 32 },
  { id: '48w',   label: '48 Wide',  columns: 48 },
] as const;

export const DEFAULT_PRESET_ID = 'auto';

/**
 * Replicates the legacy `montage.php` default-layout heuristic:
 *
 *   ≤3 monitors → <n> Wide (1, 2, or 3 columns)
 *   ≤4          → 2 Wide
 *   ≤6          → 3 Wide
 *   divisible by 4 → 4 Wide
 *   divisible by 6 → 6 Wide
 *   else        → 4 Wide
 */
export function autoColumns(monitorCount: number): number {
  if (monitorCount <= 0) return 1;
  if (monitorCount <= 3) return monitorCount;
  if (monitorCount <= 4) return 2;
  if (monitorCount <= 6) return 3;
  if (monitorCount % 4 === 0) return 4;
  if (monitorCount % 6 === 0) return 6;
  return 4;
}
