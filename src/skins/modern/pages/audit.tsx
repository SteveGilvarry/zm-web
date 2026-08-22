import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Filter, RefreshCw } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { MonitorFilterBar } from '@/features/monitors/MonitorFilterBar';
import { useMonitorFilter } from '@/features/monitors/useMonitorFilter';
import { useAuditCells } from '@/features/audit/AuditTableBody';
import { useAuditPage, type AuditSortDir } from '@/features/audit/useAuditPage';
import type { AuditSortKey } from '@/features/audit/auditRows';
import { ToolbarDisclosure } from '../components/ToolbarDisclosure';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

const field = clsx(
  'px-2 py-1 text-sm bg-surface border border-border-subtle rounded',
  'text-fg focus:outline-none focus:border-accent transition-colors',
);
const toolBtn = 'p-1.5 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors disabled:opacity-50';

/**
 * Event audit — the modern skin.
 *
 * Legacy `?view=report_event_audit`: per-monitor Events / First / Last /
 * MinGap / MaxGap inside a time window. The window is the control an
 * operator moves, so it is the query line; the monitor chips sit behind
 * Monitors, counted (docs/DESIGN.md). The table owns the rest of the height.
 */
export default function AuditPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('Audit Events Report'));
  const s = useAuditPage();
  const cells = useAuditCells(s);
  // Selections live in the shared store, so the count is readable whether or
  // not the chip bar is on screen.
  const { activeCount } = useMonitorFilter(s.allMonitors);

  if (!s.isAuthenticated) return null;

  const note = t('Events that start after the window opens and have ended by the time it closes. MissingFiles / ZeroSize need per-event file checks (zm-api#36).');

  return (
    <AppShell title={t('Audit Events Report')}>
      <main className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center gap-2 px-3 h-11 shrink-0 border-b border-border-subtle bg-surface">
          <span className="shrink-0 text-xs text-fg-dim">{t('Event Start Time')}</span>
          <input
            type="datetime-local"
            step={1}
            aria-label={t('Window start')}
            value={s.minInput}
            onChange={(e) => s.setWindow(e.target.value, s.maxInput)}
            className={field}
          />
          <span className="shrink-0 text-xs text-fg-dim">{t('to')}</span>
          <input
            type="datetime-local"
            step={1}
            aria-label={t('Window end')}
            value={s.maxInput}
            onChange={(e) => s.setWindow(s.minInput, e.target.value)}
            className={field}
          />

          <ToolbarDisclosure label={t('Monitors')} icon={Filter} count={activeCount}>
            <MonitorFilterBar monitors={s.allMonitors} onChange={s.setVisibleMonitors} />
          </ToolbarDisclosure>

          <span className="ms-auto" />

          <button type="button" onClick={s.refetch} aria-label={t('Refresh')} className={toolBtn}>
            <RefreshCw size={16} />
          </button>
        </div>

        {/* The table is the page: it scrolls under its own pinned header. */}
        <div className="flex-1 min-h-0 overflow-auto p-3">
          <QueryState
            isLoading={s.monitorsLoading}
            isError={!!s.monitorsError}
            error={s.monitorsError}
            onRetry={s.refetch}
            empty={s.sorted.length === 0}
            emptyMessage={t('No monitors match the filter.')}
          >
            <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
              <table className="w-full text-sm" data-testid="audit-table">
                <thead className="sticky top-0 z-10 bg-surface border-b border-border-subtle">
                  <tr>
                    <Th label={t('Id')}         sortKey="id"     active={s.sortKey} dir={s.sortDir} onClick={s.toggleSort} />
                    <Th label={t('Name')}       sortKey="name"   active={s.sortKey} dir={s.sortDir} onClick={s.toggleSort} />
                    <Th label={t('Server')}     sortKey="server" active={s.sortKey} dir={s.sortDir} onClick={s.toggleSort} />
                    <Th label={t('Events')}     sortKey="events" active={s.sortKey} dir={s.sortDir} onClick={s.toggleSort} numeric />
                    <Th label={t('FirstEvent')} sortKey="first"  active={s.sortKey} dir={s.sortDir} onClick={s.toggleSort} />
                    <Th label={t('LastEvent')}  sortKey="last"   active={s.sortKey} dir={s.sortDir} onClick={s.toggleSort} />
                    <Th label={t('MinGap')}     sortKey="minGap" active={s.sortKey} dir={s.sortDir} onClick={s.toggleSort} numeric />
                    <Th label={t('MaxGap')}     sortKey="maxGap" active={s.sortKey} dir={s.sortDir} onClick={s.toggleSort} numeric />
                    <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-fg-dim">{t('MissingFiles')}</th>
                    <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-fg-dim">{t('ZeroSize')}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.sorted.map((row) => {
                    const c = cells(row, 'text-fg hover:text-accent transition-colors');
                    return (
                      <tr key={row.monitor.id} data-testid={`audit-row-${row.monitor.id}`} className="border-b border-border-subtle last:border-0 hover:bg-surface-2 transition-colors">
                        <td className="px-3 py-1 font-mono tabular-nums text-fg-muted">{c.id}</td>
                        <td className="px-3 py-1 truncate max-w-[16rem]">{c.name}</td>
                        <td className="px-3 py-1 text-fg-muted">{c.server}</td>
                        <td className="px-3 py-1 text-end font-mono tabular-nums">{c.events}</td>
                        <td className="px-3 py-1 whitespace-nowrap text-fg-muted">{c.first}</td>
                        <td className="px-3 py-1 whitespace-nowrap text-fg-muted">{c.last}</td>
                        <td className="px-3 py-1 text-end font-mono tabular-nums text-fg-muted">{c.minGap}</td>
                        <td className="px-3 py-1 text-end font-mono tabular-nums text-fg-muted">{c.maxGap}</td>
                        <td className="px-3 py-1 text-center text-fg-dim">{c.placeholder}</td>
                        <td className="px-3 py-1 text-center text-fg-dim">{c.placeholder}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-border-subtle text-xs text-fg-dim">
                  <tr data-testid="audit-totals">
                    <td className="px-3 py-2 font-medium" colSpan={3}>{t('Totals')}</td>
                    <td className="px-3 py-2 text-end font-mono tabular-nums font-medium text-fg">{s.totals.events}</td>
                    <td className="px-3 py-2" colSpan={6} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </QueryState>
        </div>

        {/* Status bar: how much is on screen, and the caveats that go with it. */}
        <div className="flex items-center gap-3 px-3 py-2 shrink-0 border-t border-border-subtle bg-surface text-xs text-fg-dim">
          <span className="shrink-0">{t('{{count}} monitor', { count: s.sorted.length })}</span>
          {s.truncatedMonitorIds.length > 0 && (
            <span className="text-warn">
              {t('Monitors {{ids}} have more events than the audit reads; their counts are lower bounds.', { ids: s.truncatedMonitorIds.join(', ') })}
            </span>
          )}
          <span className="ms-auto min-w-0 truncate" title={note}>{note}</span>
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
      scope="col"
      className={clsx(
        'px-3 py-2 text-xs font-medium text-fg-dim cursor-pointer select-none whitespace-nowrap',
        'hover:text-fg transition-colors',
        numeric ? 'text-end' : 'text-start',
      )}
      onClick={() => onClick(sortKey)}
      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className={clsx('inline-flex items-center gap-1', isActive && 'text-fg')}>
        {label}
        {isActive && (dir === 'asc' ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />)}
      </span>
    </th>
  );
}
