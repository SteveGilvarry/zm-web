import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Circle, Copy, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { MonitorPreview } from '@/components/monitors/MonitorPreview';
import { formatFps, runtimeTone, type MonitorRuntime, type RuntimeTone } from './useMonitorStatuses';
import type { Monitor } from '@/types';

const BADGE: Record<RuntimeTone, string> = {
  ok: 'bg-emerald-50 border-emerald-300 text-emerald-700',
  warn: 'bg-amber-50 border-amber-300 text-amber-700',
  down: 'bg-red-50 border-red-300 text-red-700',
  unknown: 'bg-zinc-100 border-zinc-300 text-zinc-500',
};

interface ClassicMonitorsTableProps {
  monitors: Monitor[];
  liveSessionIds: Set<number>;
  /** Capture-process state per monitor; drives the Status badge. */
  runtimeById?: Record<number, MonitorRuntime>;
  onClone?: (id: number) => void;
  onDelete?: (id: number, name: string) => void;
  busy?: boolean;
}

/**
 * Legacy ZM-style monitors table. One row per monitor with thumbnail and the
 * columns operators expect: id, name, function (capturing/analysing/recording),
 * source, resolution, status. Sortable / searchable / paginated is handled
 * outside; this component renders the rows.
 */
export function ClassicMonitorsTable({
  monitors, liveSessionIds, runtimeById = {}, onClone, onDelete, busy,
}: ClassicMonitorsTableProps) {
  const { t, i18n } = useTranslation();

  if (monitors.length === 0) {
    return (
      <div className="bg-white border border-zinc-300 rounded p-12 text-center text-zinc-500">
        {t('No monitors configured.')}
      </div>
    );
  }

  return (
    <div className="bg-white border border-zinc-300 rounded overflow-hidden">
      <table className="w-full text-sm text-zinc-800">
        <thead className="bg-zinc-100 border-b border-zinc-300 text-[11px] uppercase tracking-wider">
          <tr>
            <th className="px-3 py-2 text-start font-semibold">{t('ID')}</th>
            <th className="px-2 py-2 text-start font-semibold">{t('Thumbnail')}</th>
            <th className="px-3 py-2 text-start font-semibold">{t('Name')}</th>
            <th className="px-3 py-2 text-start font-semibold">{t('Function')}</th>
            <th className="px-3 py-2 text-start font-semibold">{t('Source')}</th>
            <th className="px-3 py-2 text-start font-semibold">{t('Resolution')}</th>
            <th className="px-3 py-2 text-start font-semibold">{t('Status')}</th>
            <th className="px-3 py-2 text-end font-semibold w-24">{t('Actions')}</th>
          </tr>
        </thead>
        <tbody>
          {monitors.map((m) => {
            const isActive = m.capturing !== 'None';
            const isStreaming = liveSessionIds.has(m.id);
            const runtime = runtimeById[m.id];
            const tone: RuntimeTone = isActive ? runtimeTone(runtime?.status) : 'unknown';
            return (
              <tr key={m.id} className="border-b border-zinc-200 hover:bg-zinc-50 transition-colors">
                <td className="px-3 py-2 font-mono text-zinc-500">{m.id}</td>
                <td className="px-2 py-1.5">
                  <div className="w-16 h-10 relative rounded overflow-hidden bg-zinc-200">
                    <MonitorPreview
                      monitorId={m.id}
                      monitorName={m.name}
                      orientation={m.orientation}
                      isActive={isActive}
                      compact
                    />
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Link
                    to="/monitors/$monitorId"
                    params={{ monitorId: String(m.id) }}
                    className="inline-flex items-center gap-2 text-cyan-700 hover:underline"
                  >
                    <Circle
                      size={6}
                      className={isActive ? 'fill-emerald-500 text-emerald-500' : 'fill-zinc-400 text-zinc-400'}
                    />
                    {m.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-zinc-700 text-xs">
                  {m.capturing ?? 'None'} / {m.analysing ?? 'None'} / {m.recording ?? 'None'}
                </td>
                <td className="px-3 py-2 font-mono text-zinc-600 text-xs">
                  {m.host ?? '—'}
                </td>
                <td className="px-3 py-2 font-mono text-zinc-600 text-xs">
                  {m.width && m.height ? `${m.width}×${m.height}` : '—'}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {isActive ? (
                      <span
                        className={clsx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border tabular-nums', BADGE[tone])}
                        data-testid={`monitor-status-${m.id}`}
                      >
                        {runtime ? runtime.status : t('Capturing')}
                        {runtime && <span className="font-mono opacity-80">{formatFps(runtime.captureFps, i18n.language)}</span>}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-zinc-100 border border-zinc-300 text-zinc-500">
                        {t('Idle')}
                      </span>
                    )}
                    {isStreaming && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-cyan-50 border border-cyan-300 text-cyan-700">
                        {t('Live')}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-end">
                  <div className="inline-flex items-center gap-1">
                    {onClone && (
                      <button
                        onClick={() => onClone(m.id)}
                        disabled={busy}
                        aria-label={t('Clone {{name}}', { name: m.name })}
                        title={t('Clone')}
                        className="p-1 rounded text-zinc-500 hover:text-cyan-700 hover:bg-cyan-50 transition-colors disabled:opacity-40"
                      >
                        <Copy size={12} />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(m.id, m.name)}
                        disabled={busy}
                        aria-label={t('Delete {{name}}', { name: m.name })}
                        title={t('Delete')}
                        className="p-1 rounded text-zinc-500 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
