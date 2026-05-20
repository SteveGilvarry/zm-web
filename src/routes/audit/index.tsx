import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { clsx } from 'clsx';
import { Shield, ChevronRight, Archive } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { useAuthStore } from '@/stores/auth';
import { getEvents } from '@/api/events';
import { getMonitors } from '@/api/monitors';

export const Route = createFileRoute('/audit/')({
  component: AuditPage,
});

/**
 * Audit Events Report. The legacy ZM view focuses on archived / preserved
 * events — the ones operators have explicitly flagged for retention. We pull
 * the same set here (archived = true) and surface the columns most useful
 * for an audit log: id, monitor, start time, max score, notes, tags.
 */
function AuditPage() {
  const { isAuthenticated } = useAuthStore();

  const archivedQ = useQuery({
    queryKey: ['events', 'audit', 'archived'],
    queryFn: () => getEvents({ page: 1, page_size: 100, archived: true }),
    enabled: isAuthenticated,
  });

  const monitorsQ = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });

  const monitorLookup = useMemo(() => {
    const m = new Map<number, string>();
    (monitorsQ.data?.items ?? []).forEach((mon) => m.set(mon.id, mon.name));
    return m;
  }, [monitorsQ.data]);

  const events = archivedQ.data?.items ?? [];

  if (!isAuthenticated) return null;

  return (
    <AppShell title="Audit">
      <main className="flex-1 p-6 overflow-auto">
        <Panel
          title="Audit Events Report"
          icon={<Shield size={16} />}
          action={
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
              {archivedQ.data?.total ?? 0} archived
            </span>
          }
          noPadding
        >
          {archivedQ.isLoading ? (
            <div className="p-8 space-y-2">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="h-8 bg-surface/50 rounded animate-pulse" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="py-12 text-center text-text-muted text-sm">
              No archived events to audit yet. Archive an event from its detail
              page to add it to this report.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-surface/70 border-b border-border-subtle text-[10px] uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">ID</th>
                  <th className="px-3 py-2 text-left">Monitor</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Started</th>
                  <th className="px-3 py-2 text-right">Frames</th>
                  <th className="px-3 py-2 text-right">Alarm</th>
                  <th className="px-3 py-2 text-right">Max Score</th>
                  <th className="px-3 py-2 text-left">Tags</th>
                  <th className="px-3 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-b border-border-subtle/40 hover:bg-surface/40 transition-colors">
                    <td className="px-3 py-2 font-mono text-text-muted">#{e.id}</td>
                    <td className="px-3 py-2 text-text-secondary truncate max-w-[12rem]">
                      {monitorLookup.get(e.monitor_id) ?? `Monitor ${e.monitor_id}`}
                    </td>
                    <td className="px-3 py-2 text-text-primary truncate max-w-[12rem]">
                      <span className="inline-flex items-center gap-1.5">
                        <Archive size={11} className="text-amber" />
                        {e.name}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-text-secondary whitespace-nowrap">
                      {e.start_date_time
                        ? new Date(e.start_date_time).toLocaleString([], {
                            month: '2-digit', day: '2-digit', year: '2-digit',
                            hour: '2-digit', minute: '2-digit', hour12: false,
                          })
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{e.frames ?? 0}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-crimson">
                      {e.alarm_frames ?? 0}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-amber">
                      {e.max_score ?? 0}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(e.tags ?? []).map((t) => (
                          <span
                            key={t.id}
                            className={clsx(
                              'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px]',
                              'bg-cyan/15 border border-cyan/30 text-cyan',
                            )}
                          >
                            {t.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to="/events/$eventId"
                        params={{ eventId: String(e.id) }}
                        className="inline-flex items-center text-cyan hover:text-cyan-dim transition-colors"
                        aria-label={`Open event ${e.id}`}
                      >
                        <ChevronRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </main>
    </AppShell>
  );
}
