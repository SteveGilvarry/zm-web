import { useTranslation } from 'react-i18next';
import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { MonitorFilterBar } from '@/features/monitors/MonitorFilterBar';
import { useAuditCells } from '@/features/audit/AuditTableBody';
import { useAuditPage } from '@/features/audit/useAuditPage';
import type { AuditSortKey } from '@/features/audit/auditRows';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { ClassicTable, ClassicTbody, ClassicTd, ClassicTh, ClassicThead } from '../components/events/primitives';
import { classicInput, classicLink } from '../components/events/styles';

/**
 * Audit Events Report — classic skin, after legacy `?view=report_event_audit`:
 * monitor filter bar, "Event Start Time … to …" window, then the per-monitor
 * table (Id, Name, Server, Events, FirstEvent, LastEvent, MinGap, MaxGap,
 * MissingFiles, ZeroSize).
 */
export default function ClassicAuditPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('Audit Events Report'));
  const s = useAuditPage();
  const cells = useAuditCells(s);

  if (!s.isAuthenticated) return null;

  const th = (label: string, key: AuditSortKey, numeric = false) => (
    <ClassicTh sortable numeric={numeric} active={s.sortKey === key} dir={s.sortDir} onSort={() => s.toggleSort(key)}>
      {label}
    </ClassicTh>
  );

  return (
    <AppShell title={t('Audit Events Report')}>
      <main className="flex-1 overflow-auto bg-white text-zinc-900">
        <div className="px-4 py-2 border-b border-[#dee2e6] space-y-2">
          <MonitorFilterBar monitors={s.allMonitors} onChange={s.setVisibleMonitors} />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="font-semibold text-zinc-700">{t('Event Start Time')}</label>
            <input type="datetime-local" step={1} aria-label={t('Window start')} value={s.minInput} onChange={(e) => s.setWindow(e.target.value, s.maxInput)} className={classicInput} />
            <span>{t('to')}</span>
            <input type="datetime-local" step={1} aria-label={t('Window end')} value={s.maxInput} onChange={(e) => s.setWindow(s.minInput, e.target.value)} className={classicInput} />
          </div>
          <p className="text-xs text-zinc-500">
            {t('Events that start after the window opens and have ended by the time it closes. MissingFiles / ZeroSize need per-event file checks (zm-api#36).')}
            {s.truncatedMonitorIds.length > 0 && (
              <span className="ms-1 text-[#856404]">
                {t('Monitors {{ids}} have more events than the audit reads; their counts are lower bounds.', { ids: s.truncatedMonitorIds.join(', ') })}
              </span>
            )}
          </p>
        </div>

        <div className="p-4">
          <QueryState
            isLoading={s.monitorsLoading}
            isError={!!s.monitorsError}
            error={s.monitorsError}
            onRetry={s.refetch}
            empty={s.sorted.length === 0}
            emptyMessage={t('No monitors match the filter.')}
          >
            <ClassicTable testId="audit-table">
              <ClassicThead>
                <tr>
                  {th(t('Id'), 'id')}
                  {th(t('Name'), 'name')}
                  {th(t('Server'), 'server')}
                  {th(t('Events'), 'events', true)}
                  {th(t('FirstEvent'), 'first')}
                  {th(t('LastEvent'), 'last')}
                  {th(t('MinGap'), 'minGap', true)}
                  {th(t('MaxGap'), 'maxGap', true)}
                  <ClassicTh center>{t('MissingFiles')}</ClassicTh>
                  <ClassicTh center>{t('ZeroSize')}</ClassicTh>
                </tr>
              </ClassicThead>
              <ClassicTbody>
                {s.sorted.map((row) => {
                  const c = cells(row, classicLink);
                  return (
                    <tr key={row.monitor.id} data-testid={`audit-row-${row.monitor.id}`}>
                      <ClassicTd>{c.id}</ClassicTd>
                      <ClassicTd>{c.name}</ClassicTd>
                      <ClassicTd>{c.server}</ClassicTd>
                      <ClassicTd numeric>{c.events}</ClassicTd>
                      <ClassicTd className="whitespace-nowrap">{c.first}</ClassicTd>
                      <ClassicTd className="whitespace-nowrap">{c.last}</ClassicTd>
                      <ClassicTd numeric>{c.minGap}</ClassicTd>
                      <ClassicTd numeric>{c.maxGap}</ClassicTd>
                      <ClassicTd center className="text-zinc-400">{c.placeholder}</ClassicTd>
                      <ClassicTd center className="text-zinc-400">{c.placeholder}</ClassicTd>
                    </tr>
                  );
                })}
              </ClassicTbody>
              <tfoot className="bg-[#f8f9fa]">
                <tr data-testid="audit-totals">
                  <ClassicTd colSpan={3} className="font-semibold">{t('Total ({{count}} monitors)', { count: s.sorted.length })}</ClassicTd>
                  <ClassicTd numeric className="font-semibold">{s.totals.events}</ClassicTd>
                  <ClassicTd colSpan={6} />
                </tr>
              </tfoot>
            </ClassicTable>
          </QueryState>
        </div>
      </main>
    </AppShell>
  );
}
