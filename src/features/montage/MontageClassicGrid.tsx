import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { LayoutGrid as LayoutGridIcon } from 'lucide-react';
import { StreamCell } from '@/components/common/StreamCell';
import { useMontageStore } from '@/stores/montage';
import { useMonitorStatuses, formatFps, runtimeTone, type MonitorRuntime } from '@/features/monitors/useMonitorStatuses';
import type { Monitor, StreamProtocol } from '@/types';
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
 * Legacy ZM-style flat montage grid. A toolbar with a layout preset
 * selector (Auto / 1 Wide / … / 48 Wide) and a protocol switch over a
 * CSS-grid wall of live cells, each with the legacy "outside bottom"
 * caption (name + runtime state + capture fps). Mirrors `?view=montage` in
 * classic ZoneMinder — no mosaic splits, no saved layouts, no fullscreen.
 *
 * Cells are gated on viewport visibility and the live-tile budget, so a
 * 48-camera wall only streams what is on screen.
 *
 * Styling is light-mode (`bg-white`, zinc text, blue accents) to match the
 * rest of the classic skin (`ConsoleClassicTable`).
 */
export function MontageClassicGrid({ monitors }: MontageClassicGridProps) {
  const { t } = useTranslation();
  const [presetId, setPresetId] = useState<string>(DEFAULT_PRESET_ID);
  const { protocol, setProtocol } = useMontageStore();
  const { byId: runtimeById } = useMonitorStatuses(monitors.length > 0);

  const preset = useMemo(
    () => MONTAGE_PRESETS.find((p) => p.id === presetId) ?? MONTAGE_PRESETS[0],
    [presetId],
  );

  const columns = preset.columns ?? autoColumns(monitors.length);

  const presetLabel = (p: MontagePreset) =>
    p.columns == null ? t('Auto') : t('{{n}} Wide', { n: p.columns });

  return (
    <div className="space-y-3">
      {/* Top toolbar — layout preset + protocol. */}
      <div className="flex items-center gap-3 bg-white border border-zinc-300 rounded px-3 py-2 flex-wrap">
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
        <label className="flex items-center gap-1.5 text-xs text-zinc-700">
          <span className="font-semibold uppercase tracking-wide">{t('Protocol')}</span>
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.target.value as StreamProtocol)}
            aria-label={t('Stream protocol')}
            className="bg-white border border-zinc-300 rounded px-2 py-1 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
          >
            <option value="webrtc">WebRTC</option>
            <option value="hls">HLS</option>
          </select>
        </label>
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
            <ClassicCell key={m.id} monitor={m} protocol={protocol} runtime={runtimeById[m.id]} />
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Cell                                                                      */
/* -------------------------------------------------------------------------- */

const TONE_DOT: Record<ReturnType<typeof runtimeTone>, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  down: 'bg-red-500',
  unknown: 'bg-zinc-400',
};

function ClassicCell({
  monitor,
  protocol,
  runtime,
}: {
  monitor: Monitor;
  protocol: StreamProtocol;
  runtime: MonitorRuntime | undefined;
}) {
  const { t, i18n } = useTranslation();
  const tone = runtimeTone(runtime?.status);
  return (
    <div
      data-testid={`montage-classic-cell-${monitor.id}`}
      className="bg-white border border-zinc-300 rounded overflow-hidden flex flex-col"
    >
      <div className="relative w-full aspect-video bg-zinc-900">
        <StreamCell
          protocol={protocol}
          monitorId={monitor.id}
          monitorName={monitor.name}
          orientation={monitor.orientation}
          autoStart
          gated
          compact
          rotationFit="fit"
        />
      </div>
      {/* Legacy "outside bottom" caption: name + state + capture fps. */}
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
            className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', TONE_DOT[tone])}
            aria-label={runtime?.status ?? t('Unknown')}
          />
          <span className="truncate">{monitor.name}</span>
        </Link>
        <span className="font-mono text-[10px] text-zinc-500 flex-shrink-0 tabular-nums" data-testid={`montage-classic-status-${monitor.id}`}>
          {runtime
            ? `${runtime.status} · ${formatFps(runtime.captureFps, i18n.language)}`
            : `#${monitor.id}`}
        </span>
      </div>
    </div>
  );
}
