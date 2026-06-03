import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { LayoutGrid as LayoutGridIcon } from 'lucide-react';
import { MonitorPreview } from '@/components/monitors/MonitorPreview';
import type { Monitor } from '@/types';

/* -------------------------------------------------------------------------- */
/*  Preset definitions                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Legacy ZM montage layout presets. Each `N Wide` preset means "N cells per
 * row"; the grid wraps to as many rows as the monitor count needs. `Auto`
 * picks a column count from the monitor count using the same heuristic as
 * `montage.php` (see legacy-requirements/montage.md, lines 87–95).
 *
 * Exported for unit tests and route consumption.
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

const DEFAULT_PRESET_ID = 'auto';

/**
 * Replicates the legacy `montage.php` default-layout heuristic:
 *
 *   ≤3 monitors → <n> Wide (1, 2, or 3 columns)
 *   ≤4          → 2 Wide
 *   ≤6          → 3 Wide
 *   divisible by 4 → 4 Wide
 *   divisible by 6 → 6 Wide
 *   else        → 4 Wide
 *
 * Exported for unit tests.
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

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export interface MontageClassicGridProps {
  /** Monitors to display — usually the post-filter list from MonitorFilterBar. */
  monitors: Monitor[];
}

/**
 * Legacy ZM-style flat montage grid. A toolbar with a single layout preset
 * selector (Auto / 1 Wide / … / 48 Wide) over a CSS-grid wall of live
 * `<MonitorPreview>` cells. Mirrors `?view=montage` in classic ZoneMinder —
 * no mosaic splits, no saved layouts, no protocol switching, no fullscreen.
 *
 * Styling is light-mode (`bg-white`, zinc text, blue accents) to match the
 * rest of the classic skin (`ConsoleClassicTable`).
 */
export function MontageClassicGrid({ monitors }: MontageClassicGridProps) {
  const [presetId, setPresetId] = useState<string>(DEFAULT_PRESET_ID);

  const preset = useMemo(
    () => MONTAGE_PRESETS.find((p) => p.id === presetId) ?? MONTAGE_PRESETS[0],
    [presetId],
  );

  const columns = preset.columns ?? autoColumns(monitors.length);

  return (
    <div className="space-y-3">
      {/* Top toolbar — just the layout preset selector. */}
      <div className="flex items-center gap-3 bg-white border border-zinc-300 rounded px-3 py-2">
        <label
          htmlFor="montage-classic-layout"
          className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 uppercase tracking-wide"
        >
          <LayoutGridIcon size={14} className="text-zinc-500" />
          Layout
        </label>
        <select
          id="montage-classic-layout"
          value={presetId}
          onChange={(e) => setPresetId(e.target.value)}
          aria-label="Montage layout preset"
          className="bg-white border border-zinc-300 rounded px-2 py-1 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
        >
          {MONTAGE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-500 ml-auto tabular-nums">
          {monitors.length} monitor{monitors.length === 1 ? '' : 's'}
          {' · '}
          {columns} column{columns === 1 ? '' : 's'}
        </span>
      </div>

      {/* Grid */}
      {monitors.length === 0 ? (
        <div
          className="bg-white rounded border border-zinc-300 p-12 text-center text-zinc-500 text-sm"
          data-testid="montage-classic-empty"
        >
          No monitors to display.
        </div>
      ) : (
        <div
          data-testid="montage-classic-grid"
          data-columns={columns}
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {monitors.map((m) => (
            <ClassicCell key={m.id} monitor={m} />
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Cell                                                                      */
/* -------------------------------------------------------------------------- */

function ClassicCell({ monitor }: { monitor: Monitor }) {
  const isActive = monitor.capturing !== 'None';
  return (
    <div
      data-testid={`montage-classic-cell-${monitor.id}`}
      className="bg-white border border-zinc-300 rounded overflow-hidden flex flex-col"
    >
      <div className="relative w-full aspect-video bg-zinc-900">
        <MonitorPreview
          monitorId={monitor.id}
          monitorName={monitor.name}
          orientation={monitor.orientation}
          isActive={isActive}
          compact
        />
      </div>
      <div
        className={clsx(
          'flex items-center justify-between gap-2 px-2 py-1 text-xs border-t border-zinc-200',
          'bg-zinc-50 text-zinc-700',
        )}
      >
        <Link
          to="/monitors/$monitorId"
          params={{ monitorId: String(monitor.id) }}
          className="inline-flex items-center gap-1.5 text-cyan-700 hover:underline truncate"
        >
          <span
            className={clsx(
              'w-1.5 h-1.5 rounded-full flex-shrink-0',
              isActive ? 'bg-emerald-500' : 'bg-zinc-400',
            )}
          />
          <span className="truncate">{monitor.name}</span>
        </Link>
        <span className="font-mono text-[10px] text-zinc-500 flex-shrink-0">
          #{monitor.id}
        </span>
      </div>
    </div>
  );
}
