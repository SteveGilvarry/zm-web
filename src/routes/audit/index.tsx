import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Archive,
  ArrowRight,
  HelpCircle,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { formatBytes } from '@/lib/format';
import {
  useAuditData,
  compareAuditRows,
  computeAuditTotals,
  type AuditData,
  type AuditRow,
  type AuditSortKey,
} from '@/features/audit/useAuditData';

export const Route = createFileRoute('/audit/')({
  component: AuditPage,
});

/**
 * Event-integrity audit (legacy `?view=report_event_audit`).
 *
 * Per-monitor rollup of event counts + disk usage across the standard
 * timeframes (hour/day/week/month/total/archived). Both skins render
 * the same data; only the chrome differs.
 *
 * MissingFiles + ZeroSize columns from the legacy view are intentionally
 * omitted for v1 — checking per-event file presence would require an
 * O(N) round trip against `/api/v3/events/{id}/video` HEAD, and the
 * backend has no bulk `disk_space=0` filter. The placeholder column
 * carries an explanatory tooltip so operators know it's not just empty.
 */
function AuditPage() {
  const { isAuthenticated } = useAuthStore();
  const skin = useUiStore((s) => s.skin);
  const data = useAuditData();

  if (!isAuthenticated) return null;

  return (
    <AppShell title="Audit">
      {skin === 'classic' ? (
        <AuditClassic data={data} />
      ) : (
        <AuditModern data={data} />
      )}
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared sort hook                                                          */
/* -------------------------------------------------------------------------- */

function useSortedRows(rows: AuditRow[]) {
  const [sortKey, setSortKey] = useState<AuditSortKey>('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sorted = useMemo(() => {
    const copy = rows.slice();
    copy.sort((a, b) => {
      const cmp = compareAuditRows(a, b, sortKey);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: AuditSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return { sortKey, sortDir, toggleSort, sorted };
}

/* -------------------------------------------------------------------------- */
/*  Breadcrumb / context strip                                                */
/* -------------------------------------------------------------------------- */

function ArchivedLink({ variant }: { variant: 'modern' | 'classic' }) {
  const cls = variant === 'classic'
    ? 'inline-flex items-center gap-1.5 text-sm text-cyan-700 hover:underline'
    : 'inline-flex items-center gap-1.5 text-sm text-cyan hover:text-cyan-dim transition-colors';
  return (
    <Link
      to="/events"
      search={{ archived: true }}
      className={cls}
      aria-label="Browse archived events"
    >
      <Archive size={14} />
      Browse archived events
      <ArrowRight size={14} />
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/*  Modern skin                                                               */
/* -------------------------------------------------------------------------- */

function AuditModern({ data }: { data: AuditData }) {
  const { sortKey, sortDir, toggleSort, sorted } = useSortedRows(data.rows);
  const totals = useMemo(() => computeAuditTotals(sorted), [sorted]);

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-text-muted max-w-2xl">
          Per-monitor event-integrity rollup: counts and disk usage across the
          standard timeframes. The legacy MissingFiles / ZeroSize columns
          require per-event filesystem checks and are not available in v1.
        </p>
        <ArchivedLink variant="modern" />
      </div>

      <Panel
        title="Audit Events Report"
        icon={<ShieldCheck size={16} />}
        action={
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
            {sorted.length} monitor{sorted.length === 1 ? '' : 's'}
          </span>
        }
        noPadding
      >
        {data.loading ? (
          <div className="p-8 space-y-2" data-testid="audit-loading">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-8 bg-surface/50 rounded animate-pulse" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-12 text-center text-text-muted text-sm">
            No monitors configured.
          </div>
        ) : (
          <table className="w-full text-xs" data-testid="audit-table">
            <thead className="bg-surface/70 border-b border-border-subtle text-[10px] uppercase tracking-wider text-text-muted">
              <tr>
                <ModernTh label="ID"        sortKey="id"       active={sortKey} dir={sortDir} onClick={toggleSort} />
                <ModernTh label="Monitor"   sortKey="name"     active={sortKey} dir={sortDir} onClick={toggleSort} />
                <ModernTh label="Total"     sortKey="total"    active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                <ModernTh label="Hour"      sortKey="hour"     active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                <ModernTh label="Day"       sortKey="day"      active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                <ModernTh label="Week"      sortKey="week"     active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                <ModernTh label="Month"     sortKey="month"    active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                <ModernTh label="Archived"  sortKey="archived" active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                <th className="px-3 py-2 text-center" title="Per-event file-system integrity checks are not implemented in v1.">
                  <span className="inline-flex items-center gap-1 text-text-muted">
                    Files
                    <HelpCircle size={10} />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ monitor, summary }) => (
                <tr
                  key={monitor.id}
                  data-testid={`audit-row-${monitor.id}`}
                  className="border-b border-border-subtle/40 hover:bg-surface/40 transition-colors"
                >
                  <td className="px-3 py-2 font-mono text-text-muted">#{monitor.id}</td>
                  <td className="px-3 py-2 text-text-primary truncate max-w-[16rem]">
                    <Link
                      to="/monitors/$monitorId"
                      params={{ monitorId: String(monitor.id) }}
                      className="text-cyan hover:text-cyan-dim transition-colors"
                    >
                      {monitor.name}
                    </Link>
                  </td>
                  <ModernCountCell count={summary.total_events}    disk={summary.total_event_disk_space} />
                  <ModernCountCell count={summary.hour_events}     disk={summary.hour_event_disk_space} />
                  <ModernCountCell count={summary.day_events}      disk={summary.day_event_disk_space} />
                  <ModernCountCell count={summary.week_events}     disk={summary.week_event_disk_space} />
                  <ModernCountCell count={summary.month_events}    disk={summary.month_event_disk_space} />
                  <ModernCountCell count={summary.archived_events} disk={summary.archived_event_disk_space} />
                  <td
                    className="px-3 py-2 text-center text-text-muted"
                    title="MissingFiles / ZeroSize requires per-event filesystem checks (not implemented in v1)."
                  >
                    —
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface/60 border-t border-border-subtle text-[10px] uppercase tracking-wider text-text-muted">
              <tr data-testid="audit-totals">
                <td className="px-3 py-2 font-semibold" colSpan={2}>
                  Totals
                </td>
                <ModernFootCell count={totals.total}    disk={totals.total_disk} />
                <ModernFootCell count={totals.hour}     disk={totals.hour_disk} />
                <ModernFootCell count={totals.day}      disk={totals.day_disk} />
                <ModernFootCell count={totals.week}     disk={totals.week_disk} />
                <ModernFootCell count={totals.month}    disk={totals.month_disk} />
                <ModernFootCell count={totals.archived} disk={totals.archived_disk} />
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          </table>
        )}
      </Panel>
    </main>
  );
}

interface ThProps {
  label: string;
  sortKey: AuditSortKey;
  active: AuditSortKey;
  dir: 'asc' | 'desc';
  onClick: (k: AuditSortKey) => void;
  numeric?: boolean;
}

function ModernTh({ label, sortKey, active, dir, onClick, numeric }: ThProps) {
  const isActive = active === sortKey;
  return (
    <th
      className={clsx(
        'px-3 py-2 cursor-pointer select-none hover:bg-surface transition-colors',
        numeric ? 'text-right' : 'text-left',
      )}
      onClick={() => onClick(sortKey)}
      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className={clsx('inline-flex items-center gap-1', isActive && 'text-cyan')}>
        {label}
        {isActive && (dir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
      </span>
    </th>
  );
}

function ModernCountCell({ count, disk }: { count: number; disk: number }) {
  return (
    <td className="px-3 py-2 text-right font-mono tabular-nums">
      <div className={count === 0 ? 'text-text-muted' : 'text-text-primary'}>{count}</div>
      {count > 0 && disk > 0 && (
        <div className="text-[10px] font-normal text-text-muted">{formatBytes(disk)}</div>
      )}
    </td>
  );
}

function ModernFootCell({ count, disk }: { count: number; disk: number }) {
  return (
    <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-text-primary">
      {count}
      <div className="text-[10px] font-normal text-text-muted">
        {disk > 0 ? formatBytes(disk) : '—'}
      </div>
    </td>
  );
}

/* -------------------------------------------------------------------------- */
/*  Classic skin                                                              */
/* -------------------------------------------------------------------------- */

function AuditClassic({ data }: { data: AuditData }) {
  const { sortKey, sortDir, toggleSort, sorted } = useSortedRows(data.rows);
  const totals = useMemo(() => computeAuditTotals(sorted), [sorted]);

  return (
    <main className="flex-1 p-4 overflow-auto bg-zinc-50">
      <div className="max-w-screen-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl text-zinc-800 font-semibold">Audit Events Report</h1>
          <ArchivedLink variant="classic" />
        </div>

        <p className="text-xs text-zinc-600 max-w-3xl">
          Per-monitor event-integrity rollup. Counts and disk usage across the
          standard timeframes. MissingFiles / ZeroSize columns require per-event
          filesystem checks and are not available in v1.
        </p>

        {data.loading ? (
          <div className="bg-white rounded border border-zinc-300 p-8 space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-8 bg-zinc-100 rounded animate-pulse" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded border border-zinc-300 p-12 text-center text-zinc-500">
            No monitors configured.
          </div>
        ) : (
          <div className="bg-white rounded border border-zinc-300 overflow-hidden">
            <table className="w-full text-sm text-zinc-800" data-testid="audit-table">
              <thead className="bg-zinc-100 border-b border-zinc-300 text-xs">
                <tr>
                  <ClassicTh label="ID"        sortKey="id"       active={sortKey} dir={sortDir} onClick={toggleSort} />
                  <ClassicTh label="Monitor"   sortKey="name"     active={sortKey} dir={sortDir} onClick={toggleSort} />
                  <ClassicTh label="Total"     sortKey="total"    active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                  <ClassicTh label="Hour"      sortKey="hour"     active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                  <ClassicTh label="Day"       sortKey="day"      active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                  <ClassicTh label="Week"      sortKey="week"     active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                  <ClassicTh label="Month"     sortKey="month"    active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                  <ClassicTh label="Archived"  sortKey="archived" active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                  <th
                    className="px-3 py-2 text-center font-semibold text-zinc-500"
                    title="MissingFiles / ZeroSize requires per-event filesystem checks (not implemented in v1)."
                  >
                    <span className="inline-flex items-center gap-1">
                      Files
                      <HelpCircle size={10} />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ monitor, summary }) => (
                  <tr
                    key={monitor.id}
                    data-testid={`audit-row-${monitor.id}`}
                    className="border-b border-zinc-200 hover:bg-zinc-50 transition-colors"
                  >
                    <td className="px-3 py-2 font-mono tabular-nums text-zinc-600">{monitor.id}</td>
                    <td className="px-3 py-2">
                      <Link
                        to="/monitors/$monitorId"
                        params={{ monitorId: String(monitor.id) }}
                        className="text-cyan-700 hover:underline"
                      >
                        {monitor.name}
                      </Link>
                    </td>
                    <ClassicCountCell count={summary.total_events}    disk={summary.total_event_disk_space} />
                    <ClassicCountCell count={summary.hour_events}     disk={summary.hour_event_disk_space} />
                    <ClassicCountCell count={summary.day_events}      disk={summary.day_event_disk_space} />
                    <ClassicCountCell count={summary.week_events}     disk={summary.week_event_disk_space} />
                    <ClassicCountCell count={summary.month_events}    disk={summary.month_event_disk_space} />
                    <ClassicCountCell count={summary.archived_events} disk={summary.archived_event_disk_space} />
                    <td
                      className="px-3 py-2 text-center text-zinc-400"
                      title="MissingFiles / ZeroSize requires per-event filesystem checks (not implemented in v1)."
                    >
                      —
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-zinc-50 border-t border-zinc-300 text-xs">
                <tr data-testid="audit-totals">
                  <td className="px-3 py-2 font-semibold text-zinc-700" colSpan={2}>
                    Total ({sorted.length} monitors)
                  </td>
                  <ClassicFootCell count={totals.total}    disk={totals.total_disk} />
                  <ClassicFootCell count={totals.hour}     disk={totals.hour_disk} />
                  <ClassicFootCell count={totals.day}      disk={totals.day_disk} />
                  <ClassicFootCell count={totals.week}     disk={totals.week_disk} />
                  <ClassicFootCell count={totals.month}    disk={totals.month_disk} />
                  <ClassicFootCell count={totals.archived} disk={totals.archived_disk} />
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function ClassicTh({ label, sortKey, active, dir, onClick, numeric }: ThProps) {
  const isActive = active === sortKey;
  return (
    <th
      className={clsx(
        'px-3 py-2 font-semibold cursor-pointer select-none hover:bg-zinc-200 transition-colors',
        numeric ? 'text-right' : 'text-left',
      )}
      onClick={() => onClick(sortKey)}
      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className={clsx('inline-flex items-center gap-1', isActive && 'text-cyan-700')}>
        {label}
        {isActive && (dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </span>
    </th>
  );
}

function ClassicCountCell({ count, disk }: { count: number; disk: number }) {
  return (
    <td className="px-3 py-2 text-right font-mono tabular-nums">
      <div className={count === 0 ? 'text-zinc-400' : ''}>{count}</div>
      {count > 0 && disk > 0 && (
        <div className="text-[10px] text-zinc-500">{formatBytes(disk)}</div>
      )}
    </td>
  );
}

function ClassicFootCell({ count, disk }: { count: number; disk: number }) {
  return (
    <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-zinc-800">
      {count}
      <div className="text-[10px] font-normal text-zinc-500">
        {disk > 0 ? formatBytes(disk) : '—'}
      </div>
    </td>
  );
}
