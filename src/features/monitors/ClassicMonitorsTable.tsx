import { Link } from '@tanstack/react-router';
import { Circle } from 'lucide-react';
import { MonitorPreview } from '@/components/monitors/MonitorPreview';
import type { Monitor } from '@/types';

interface ClassicMonitorsTableProps {
  monitors: Monitor[];
  liveSessionIds: Set<number>;
}

/**
 * Legacy ZM-style monitors table. One row per monitor with thumbnail and the
 * columns operators expect: id, name, function (capturing/analysing/recording),
 * source, resolution, status. Sortable / searchable / paginated is handled
 * outside; this component renders the rows.
 */
export function ClassicMonitorsTable({ monitors, liveSessionIds }: ClassicMonitorsTableProps) {
  if (monitors.length === 0) {
    return (
      <div className="bg-white border border-zinc-300 rounded p-12 text-center text-zinc-500">
        No monitors configured.
      </div>
    );
  }

  return (
    <div className="bg-white border border-zinc-300 rounded overflow-hidden">
      <table className="w-full text-sm text-zinc-800">
        <thead className="bg-zinc-100 border-b border-zinc-300 text-[11px] uppercase tracking-wider">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">ID</th>
            <th className="px-2 py-2 text-left font-semibold">Thumbnail</th>
            <th className="px-3 py-2 text-left font-semibold">Name</th>
            <th className="px-3 py-2 text-left font-semibold">Function</th>
            <th className="px-3 py-2 text-left font-semibold">Source</th>
            <th className="px-3 py-2 text-left font-semibold">Resolution</th>
            <th className="px-3 py-2 text-left font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {monitors.map((m) => {
            const isActive = m.capturing !== 'None';
            const isStreaming = liveSessionIds.has(m.id);
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
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 border border-emerald-300 text-emerald-700">
                        Capturing
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-zinc-100 border border-zinc-300 text-zinc-500">
                        Idle
                      </span>
                    )}
                    {isStreaming && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-cyan-50 border border-cyan-300 text-cyan-700">
                        Live
                      </span>
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
