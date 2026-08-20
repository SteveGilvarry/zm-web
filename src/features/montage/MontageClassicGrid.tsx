import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { LayoutGrid as LayoutGridIcon } from 'lucide-react';
import { MonitorPreview } from '@/components/monitors/MonitorPreview';
import type { Monitor } from '@/types';
import {
  MONTAGE_PRESETS,
  DEFAULT_PRESET_ID,
  autoColumns,
  type MontagePreset,
} from './classicPresets';

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
  const { t } = useTranslation();
  const [presetId, setPresetId] = useState<string>(DEFAULT_PRESET_ID);

  const preset = useMemo(
    () => MONTAGE_PRESETS.find((p) => p.id === presetId) ?? MONTAGE_PRESETS[0],
    [presetId],
  );

  const columns = preset.columns ?? autoColumns(monitors.length);

  const presetLabel = (p: MontagePreset) =>
    p.columns == null ? t('Auto') : t('{{n}} Wide', { n: p.columns });

  return (
    <div className="space-y-3">
      {/* Top toolbar — just the layout preset selector. */}
      <div className="flex items-center gap-3 bg-white border border-zinc-300 rounded px-3 py-2">
        <label
          htmlFor="montage-classic-layout"
          className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 uppercase tracking-wide"
        >
          <LayoutGridIcon size={14} className="text-zinc-500" />
          {t('Layout')}
        </label>
        <select
          id="montage-classic-layout"
          value={presetId}
          onChange={(e) => setPresetId(e.target.value)}
          aria-label={t('Montage layout preset')}
          className="bg-white border border-zinc-300 rounded px-2 py-1 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
        >
          {MONTAGE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {presetLabel(p)}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-500 ms-auto tabular-nums">
          {t('{{count}} monitor', { count: monitors.length })}
          {' · '}
          {t('{{count}} column', { count: columns })}
        </span>
      </div>

      {/* Grid — dir="ltr": the wall is physical media and never mirrors. */}
      {monitors.length === 0 ? (
        <div
          className="bg-white rounded border border-zinc-300 p-12 text-center text-zinc-500 text-sm"
          data-testid="montage-classic-empty"
        >
          {t('No monitors to display.')}
        </div>
      ) : (
        <div
          dir="ltr"
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
