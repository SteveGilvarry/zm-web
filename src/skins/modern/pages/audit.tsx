import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, ChevronDown, ChevronUp, HelpCircle, AlertTriangle } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { formatBytes } from '@/lib/format';
import { ArchivedLink } from '@/features/audit/ArchivedLink';
import { useAuditPage, type AuditSortDir } from '@/features/audit/useAuditPage';
import type { AuditSortKey } from '@/features/audit/useAuditData';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/**
 * Event-integrity audit — Mission Control.
 *
 * MissingFiles + ZeroSize columns from the legacy view are intentionally
 * omitted for v1 — checking per-event file presence would require an
 * O(N) round trip against `/api/v3/events/{id}/video` HEAD, and the
 * backend has no bulk `disk_space=0` filter. The placeholder column
 * carries an explanatory tooltip so operators know it's not just empty.
 */
export default function AuditPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('Audit'));
  const { isAuthenticated, loading, error, sortKey, sortDir, toggleSort, sorted, totals } = useAuditPage();

  if (!isAuthenticated) return null;

  return (
    <AppShell title={t('Audit')}>
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs text-text-muted max-w-2xl">
            {t('Per-monitor event-integrity rollup: counts and disk usage across the standard timeframes. The legacy MissingFiles / ZeroSize columns require per-event filesystem checks and are not available in v1.')}
          </p>
          <ArchivedLink variant="modern" />
        </div>

        <Panel
          title={t('Audit Events Report')}
          icon={<ShieldCheck size={16} />}
          action={
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
              {t('{{count}} monitor', { count: sorted.length })}
            </span>
          }
          noPadding
        >
          {error ? (
            <div
              role="alert"
              data-testid="audit-error"
              className="flex flex-col items-center gap-2 py-12 text-center text-sm"
            >
              <AlertTriangle size={28} className="text-crimson" />
              <p className="text-text-primary">{t('Could not load the audit report')}</p>
              <p className="font-mono text-xs text-text-muted">{error.message}</p>
            </div>
          ) : loading ? (
            <div className="p-8 space-y-2" data-testid="audit-loading">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="h-8 bg-surface/50 rounded animate-pulse" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="py-12 text-center text-text-muted text-sm">
              {t('No monitors configured.')}
            </div>
          ) : (
            <table className="w-full text-xs" data-testid="audit-table">
              <thead className="bg-surface/70 border-b border-border-subtle text-[10px] uppercase tracking-wider text-text-muted">
                <tr>
                  <Th label={t('ID')}       sortKey="id"       active={sortKey} dir={sortDir} onClick={toggleSort} />
                  <Th label={t('Monitor')}  sortKey="name"     active={sortKey} dir={sortDir} onClick={toggleSort} />
                  <Th label={t('Total')}    sortKey="total"    active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                  <Th label={t('Hour')}     sortKey="hour"     active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                  <Th label={t('Day')}      sortKey="day"      active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                  <Th label={t('Week')}     sortKey="week"     active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                  <Th label={t('Month')}    sortKey="month"    active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                  <Th label={t('Archived')} sortKey="archived" active={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                  <th className="px-3 py-2 text-center" title={t('Per-event file-system integrity checks are not implemented in v1.')}>
                    <span className="inline-flex items-center gap-1 text-text-muted">
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
                    <CountCell count={summary.total_events}    disk={summary.total_event_disk_space} />
                    <CountCell count={summary.hour_events}     disk={summary.hour_event_disk_space} />
                    <CountCell count={summary.day_events}      disk={summary.day_event_disk_space} />
                    <CountCell count={summary.week_events}     disk={summary.week_event_disk_space} />
                    <CountCell count={summary.month_events}    disk={summary.month_event_disk_space} />
                    <CountCell count={summary.archived_events} disk={summary.archived_event_disk_space} />
                    <td
                      className="px-3 py-2 text-center text-text-muted"
                      title={t('MissingFiles / ZeroSize requires per-event filesystem checks (not implemented in v1).')}
                    >
                      —
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-surface/60 border-t border-border-subtle text-[10px] uppercase tracking-wider text-text-muted">
                <tr data-testid="audit-totals">
                  <td className="px-3 py-2 font-semibold" colSpan={2}>
                    {t('Totals')}
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
          )}
        </Panel>
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
        'px-3 py-2 cursor-pointer select-none hover:bg-surface transition-colors',
        numeric ? 'text-end' : 'text-start',
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

function CountCell({ count, disk }: { count: number; disk: number }) {
  return (
    <td className="px-3 py-2 text-end font-mono tabular-nums">
      <div className={count === 0 ? 'text-text-muted' : 'text-text-primary'}>{count}</div>
      {count > 0 && disk > 0 && (
        <div className="text-[10px] font-normal text-text-muted">{formatBytes(disk)}</div>
      )}
    </td>
  );
}

function FootCell({ count, disk }: { count: number; disk: number }) {
  return (
    <td className="px-3 py-2 text-end font-mono tabular-nums font-semibold text-text-primary">
      {count}
      <div className="text-[10px] font-normal text-text-muted">
        {disk > 0 ? formatBytes(disk) : '—'}
      </div>
    </td>
  );
}
