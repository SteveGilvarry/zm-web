import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { formatBytes } from '@/lib/format';
import { ArchivedLink } from '@/features/audit/ArchivedLink';
import { useAuditPage, type AuditSortDir } from '@/features/audit/useAuditPage';
import type { AuditSortKey } from '@/features/audit/useAuditData';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';

/**
 * Event-integrity audit — classic skin. Same data as Mission Control in a
 * dense white table matching legacy `?view=report_event_audit`.
 */
export default function ClassicAuditPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('Audit'));
  const { isAuthenticated, loading, sortKey, sortDir, toggleSort, sorted, totals } = useAuditPage();

  if (!isAuthenticated) return null;

  return (
    <AppShell title={t('Audit')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl text-zinc-800 font-semibold">{t('Audit Events Report')}</h1>
            <ArchivedLink variant="classic" />
          </div>

          <p className="text-xs text-zinc-600 max-w-3xl">
            {t('Per-monitor event-integrity rollup. Counts and disk usage across the standard timeframes. MissingFiles / ZeroSize columns require per-event filesystem checks and are not available in v1.')}
          </p>

          {loading ? (
            <div className="bg-white rounded border border-zinc-300 p-8 space-y-2">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="h-8 bg-zinc-100 rounded animate-pulse" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="bg-white rounded border border-zinc-300 p-12 text-center text-zinc-500">
              {t('No monitors configured.')}
            </div>
          ) : (
            <div className="bg-white rounded border border-zinc-300 overflow-hidden">
              <table className="w-full text-sm text-zinc-800" data-testid="audit-table">
                <thead className="bg-zinc-100 border-b border-zinc-300 text-xs">
                  <tr>
                    <Th label={t('ID')}       sortKey="id"       active={sortKey} dir={sortDir} onClick={toggleSort} />
                    <Th label={t('Monitor')}  sortKey="name"     active={sortKey} dir={sortDir} onClick={toggleSort} />
                    <Th label={t('Total')}    sortKey="total"    active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                    <Th label={t('Hour')}     sortKey="hour"     active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                    <Th label={t('Day')}      sortKey="day"      active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                    <Th label={t('Week')}     sortKey="week"     active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                    <Th label={t('Month')}    sortKey="month"    active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                    <Th label={t('Archived')} sortKey="archived" active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                    <th
                      className="px-3 py-2 text-center font-semibold text-zinc-500"
                      title={t('MissingFiles / ZeroSize requires per-event filesystem checks (not implemented in v1).')}
                    >
                      <span className="inline-flex items-center gap-1">
                        {t('Files')}
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
                      <CountCell count={summary.total_events}    disk={summary.total_event_disk_space} />
                      <CountCell count={summary.hour_events}     disk={summary.hour_event_disk_space} />
                      <CountCell count={summary.day_events}      disk={summary.day_event_disk_space} />
                      <CountCell count={summary.week_events}     disk={summary.week_event_disk_space} />
                      <CountCell count={summary.month_events}    disk={summary.month_event_disk_space} />
                      <CountCell count={summary.archived_events} disk={summary.archived_event_disk_space} />
                      <td
                        className="px-3 py-2 text-center text-zinc-400"
                        title={t('MissingFiles / ZeroSize requires per-event filesystem checks (not implemented in v1).')}
                      >
                        —
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-zinc-50 border-t border-zinc-300 text-xs">
                  <tr data-testid="audit-totals">
                    <td className="px-3 py-2 font-semibold text-zinc-700" colSpan={2}>
                      {t('Total ({{count}} monitors)', { count: sorted.length })}
                    </td>
                    <FootCell count={totals.total}    disk={totals.total_disk} />
                    <FootCell count={totals.hour}     disk={totals.hour_disk} />
                    <FootCell count={totals.day}      disk={totals.day_disk} />
                    <FootCell count={totals.week}     disk={totals.week_disk} />
                    <FootCell count={totals.month}    disk={totals.month_disk} />
                    <FootCell count={totals.archived} disk={totals.archived_disk} />
                    <td className="px-3 py-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}

interface ThProps {
  label: string;
  sortKey: AuditSortKey;
  active: AuditSortKey;
  dir: AuditSortDir;
  onClick: (k: AuditSortKey) => void;
  numeric?: boolean;
}

function Th({ label, sortKey, active, dir, onClick, numeric }: ThProps) {
  const isActive = active === sortKey;
  return (
    <th
      className={clsx(
        'px-3 py-2 font-semibold cursor-pointer select-none hover:bg-zinc-200 transition-colors',
        numeric ? 'text-end' : 'text-start',
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

function CountCell({ count, disk }: { count: number; disk: number }) {
  return (
    <td className="px-3 py-2 text-end font-mono tabular-nums">
      <div className={count === 0 ? 'text-zinc-400' : ''}>{count}</div>
      {count > 0 && disk > 0 && (
        <div className="text-[10px] text-zinc-500">{formatBytes(disk)}</div>
      )}
    </td>
  );
}

function FootCell({ count, disk }: { count: number; disk: number }) {
  return (
    <td className="px-3 py-2 text-end font-mono tabular-nums font-semibold text-zinc-800">
      {count}
      <div className="text-[10px] font-normal text-zinc-500">
        {disk > 0 ? formatBytes(disk) : '—'}
      </div>
    </td>
  );
}
