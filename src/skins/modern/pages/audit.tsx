import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { QueryState } from '@/components/common/QueryState';
import { MonitorFilterBar } from '@/features/monitors/MonitorFilterBar';
import { useAuditCells } from '@/features/audit/AuditTableBody';
import { useAuditPage, type AuditSortDir } from '@/features/audit/useAuditPage';
import type { AuditSortKey } from '@/features/audit/auditRows';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

const field = 'px-2 py-1 text-xs bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50';

/**
 * Event audit — Mission Control. Legacy `?view=report_event_audit`: a time
 * window, the monitor filter bar, and per-monitor Events / First / Last /
 * MinGap / MaxGap computed from that monitor's events in the window.
 */
export default function AuditPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('Audit Events Report'));
  const s = useAuditPage();
  const cells = useAuditCells(s);

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={t('Audit Events Report')}>
      <main className="flex-1 p-6 overflow-auto space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <MonitorFilterBar monitors={s.allMonitors} onChange={s.setVisibleMonitors} className="flex-1" />
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span className="font-mono uppercase tracking-[0.16em]">{t('Event Start Time')}</span>
            <input
              type="datetime-local"
              step={1}
              aria-label={t('Window start')}
              value={s.minInput}
              onChange={(e) => s.setWindow(e.target.value, s.maxInput)}
              className={field}
            />
            <span>{t('to')}</span>
            <input
              type="datetime-local"
              step={1}
              aria-label={t('Window end')}
              value={s.maxInput}
              onChange={(e) => s.setWindow(s.minInput, e.target.value)}
              className={field}
            />
            <button type="button" onClick={s.refetch} aria-label={t('Refresh')} className="p-1.5 rounded border border-border-subtle text-text-muted hover:text-text-primary hover:border-cyan/40">
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        <p className="text-xs text-text-muted">
          {t('Events that start after the window opens and have ended by the time it closes. MissingFiles / ZeroSize need per-event file checks (zm-api#36).')}
          {s.truncatedMonitorIds.length > 0 && (
            <span className="ms-1 text-amber">
              {t('Monitors {{ids}} have more events than the audit reads; their counts are lower bounds.', { ids: s.truncatedMonitorIds.join(', ') })}
            </span>
          )}
        </p>

        <Panel
          title={t('Audit Events Report')}
          icon={<ShieldCheck size={16} />}
          action={
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
              {t('{{count}} monitor', { count: s.sorted.length })}
            </span>
          }
          noPadding
        >
          <QueryState
            isLoading={s.monitorsLoading}
            isError={!!s.monitorsError}
            error={s.monitorsError}
            onRetry={s.refetch}
            empty={s.sorted.length === 0}
            emptyMessage={t('No monitors match the filter.')}
          >
            <table className="w-full text-xs" data-testid="audit-table">
              <thead className="bg-surface/70 border-b border-border-subtle text-[10px] uppercase tracking-wider text-text-muted">
                <tr>
                  <Th label={t('Id')}         sortKey="id"     active={s.sortKey} dir={s.sortDir} onClick={s.toggleSort} />
                  <Th label={t('Name')}       sortKey="name"   active={s.sortKey} dir={s.sortDir} onClick={s.toggleSort} />
                  <Th label={t('Server')}     sortKey="server" active={s.sortKey} dir={s.sortDir} onClick={s.toggleSort} />
                  <Th label={t('Events')}     sortKey="events" active={s.sortKey} dir={s.sortDir} onClick={s.toggleSort} numeric />
                  <Th label={t('FirstEvent')} sortKey="first"  active={s.sortKey} dir={s.sortDir} onClick={s.toggleSort} />
                  <Th label={t('LastEvent')}  sortKey="last"   active={s.sortKey} dir={s.sortDir} onClick={s.toggleSort} />
                  <Th label={t('MinGap')}     sortKey="minGap" active={s.sortKey} dir={s.sortDir} onClick={s.toggleSort} numeric />
                  <Th label={t('MaxGap')}     sortKey="maxGap" active={s.sortKey} dir={s.sortDir} onClick={s.toggleSort} numeric />
                  <th className="px-3 py-2 text-center">{t('MissingFiles')}</th>
                  <th className="px-3 py-2 text-center">{t('ZeroSize')}</th>
                </tr>
              </thead>
              <tbody>
                {s.sorted.map((row) => {
                  const c = cells(row, 'text-cyan hover:text-cyan-dim transition-colors');
                  return (
                    <tr key={row.monitor.id} data-testid={`audit-row-${row.monitor.id}`} className="border-b border-border-subtle/40 hover:bg-surface/40 transition-colors">
                      <td className="px-3 py-2 font-mono">{c.id}</td>
                      <td className="px-3 py-2 truncate max-w-[16rem]">{c.name}</td>
                      <td className="px-3 py-2 text-text-secondary">{c.server}</td>
                      <td className="px-3 py-2 text-end font-mono tabular-nums">{c.events}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{c.first}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{c.last}</td>
                      <td className="px-3 py-2 text-end font-mono tabular-nums">{c.minGap}</td>
                      <td className="px-3 py-2 text-end font-mono tabular-nums">{c.maxGap}</td>
                      <td className="px-3 py-2 text-center text-text-muted">{c.placeholder}</td>
                      <td className="px-3 py-2 text-center text-text-muted">{c.placeholder}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-surface/60 border-t border-border-subtle text-[10px] uppercase tracking-wider text-text-muted">
                <tr data-testid="audit-totals">
                  <td className="px-3 py-2 font-semibold" colSpan={3}>{t('Totals')}</td>
                  <td className="px-3 py-2 text-end font-mono tabular-nums font-semibold text-text-primary">{s.totals.events}</td>
                  <td className="px-3 py-2" colSpan={6} />
                </tr>
              </tfoot>
            </table>
          </QueryState>
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
      className={clsx('px-3 py-2 cursor-pointer select-none hover:bg-surface transition-colors', numeric ? 'text-end' : 'text-start')}
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
