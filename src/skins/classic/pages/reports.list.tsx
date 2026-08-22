import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import {
  useCreateReportForm,
  useReportsListPage,
} from '@/features/reports/useReportsListPage';
import { useDateTimeFormat } from '@/features/config/useDateTimeFormat';
import {
  ClassicButton, ClassicPageTitle, ClassicTable, ClassicTbody, ClassicTd, ClassicTh, ClassicThead, ClassicToolbar,
} from '@/skins/classic/components/events/primitives';
import { classicInput, classicLink, classicSelect } from '@/skins/classic/components/events/styles';

/**
 * Reports list — classic skin. "+ New" toolbar, inline legacy form table,
 * white bootstrap table (Name, Filter, Start, End, Interval). Same data as
 * Mission Control via `useReportsListPage`.
 */
export default function ClassicReportsListPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('Reports'));
  const s = useReportsListPage();
  const { formatDateTime } = useDateTimeFormat();
  const formatStamp = (iso?: string | null) => (iso && formatDateTime(iso)) || '—';
  const { reports, filters, filterLookup, showCreate } = s;

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={t('Reports')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-3">
          <ClassicPageTitle>{t('Reports')}</ClassicPageTitle>

          <RequirePerm feature="events" level="Edit">
            <ClassicToolbar>
              <ClassicButton tone="primary" onClick={s.toggleCreate} aria-expanded={showCreate}>
                {showCreate ? t('Cancel') : t('+ New')}
              </ClassicButton>
            </ClassicToolbar>
            {showCreate && <CreateReportForm filters={filters} onCreated={s.onCreated} />}
          </RequirePerm>

          <QueryState
            isLoading={s.isLoading}
            isError={s.isError}
            error={s.error}
            onRetry={s.refetch}
            empty={reports.length === 0}
            emptyMessage={t('No reports yet. Create one to start.')}
          >
            <ClassicTable testId="reports-table">
              <ClassicThead>
                <tr>
                  <ClassicTh>{t('Name')}</ClassicTh>
                  <ClassicTh>{t('Filter')}</ClassicTh>
                  <ClassicTh>{t('Start')}</ClassicTh>
                  <ClassicTh>{t('End')}</ClassicTh>
                  <ClassicTh>{t('Interval')}</ClassicTh>
                  <ClassicTh center />
                </tr>
              </ClassicThead>
              <ClassicTbody>
                {reports.map((r) => (
                  <tr key={r.id} data-testid={`report-row-${r.id}`}>
                    <ClassicTd>
                      <Link
                        to="/reports/$reportId"
                        params={{ reportId: String(r.id) }}
                        className={classicLink}
                      >
                        {r.name || <span className="italic text-zinc-500">{t('untitled')}</span>}
                      </Link>
                    </ClassicTd>
                    <ClassicTd>
                      {r.filter_id != null ? (filterLookup.get(r.filter_id) ?? `#${r.filter_id}`) : '—'}
                    </ClassicTd>
                    <ClassicTd className="whitespace-nowrap">{formatStamp(r.start_date_time)}</ClassicTd>
                    <ClassicTd className="whitespace-nowrap">{formatStamp(r.end_date_time)}</ClassicTd>
                    <ClassicTd className="whitespace-nowrap">
                      {r.interval != null ? t('{{count}} min', { count: r.interval }) : t('one-off')}
                    </ClassicTd>
                    <ClassicTd center className="whitespace-nowrap">
                      <RequirePerm feature="events" level="Edit">
                        <ClassicButton
                          tone="danger"
                          size="sm"
                          aria-label={t('Delete report')}
                          onClick={() => {
                            if (confirm(t('Delete report "{{name}}"?', { name: r.name ?? `#${r.id}` }))) {
                              s.remove(r.id);
                            }
                          }}
                        >
                          {t('Delete')}
                        </ClassicButton>
                      </RequirePerm>
                    </ClassicTd>
                  </tr>
                ))}
              </ClassicTbody>
            </ClassicTable>
          </QueryState>
        </div>
      </main>
    </AppShell>
  );
}

const labelCell = 'w-44 px-3 py-2 text-end align-middle font-medium text-zinc-800 border-b border-[#dee2e6]';
const valueCell = 'px-3 py-2 align-middle border-b border-[#dee2e6]';

function CreateReportForm({
  filters,
  onCreated,
}: {
  filters: Array<{ id: number; name: string }>;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const f = useCreateReportForm(onCreated);

  return (
    <form onSubmit={f.submit} data-testid="report-create-form" className="bg-white border border-[#dee2e6]">
      <table className="w-full text-sm text-zinc-800 border-collapse">
        <tbody>
          <tr>
            <th scope="row" className={labelCell}><label htmlFor="report-name">{t('Name')}</label></th>
            <td className={valueCell}>
              <input
                id="report-name"
                value={f.name}
                onChange={(e) => f.setName(e.target.value)}
                placeholder={t('Weekly motion report')}
                // ZoneMinder's Reports.Name is varchar(30); the API turns anything
                // longer into a 500 rather than a validation error (zm_api #46).
                maxLength={30}
                className={classicInput}
              />
            </td>
          </tr>
          <tr>
            <th scope="row" className={labelCell}><label htmlFor="report-filter">{t('Filter')}</label></th>
            <td className={valueCell}>
              <select
                id="report-filter"
                value={f.filterId}
                onChange={(e) => f.setFilterId(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                className={classicSelect}
              >
                <option value="">{t('select')}</option>
                {filters.map((fl) => <option key={fl.id} value={fl.id}>{fl.name}</option>)}
              </select>
            </td>
          </tr>
          {/* Start / End / Interval are commented out of the legacy form; kept here, lower-key. */}
          <tr className="text-zinc-600">
            <th scope="row" className={labelCell}><label htmlFor="report-start">{t('Start')}</label></th>
            <td className={valueCell}>
              <input
                id="report-start"
                type="datetime-local"
                value={f.start}
                onChange={(e) => f.setStart(e.target.value)}
                className={classicInput}
              />
            </td>
          </tr>
          <tr className="text-zinc-600">
            <th scope="row" className={labelCell}><label htmlFor="report-end">{t('End')}</label></th>
            <td className={valueCell}>
              <input
                id="report-end"
                type="datetime-local"
                value={f.end}
                onChange={(e) => f.setEnd(e.target.value)}
                className={classicInput}
              />
            </td>
          </tr>
          <tr className="text-zinc-600">
            <th scope="row" className={labelCell}><label htmlFor="report-interval">{t('Interval')}</label></th>
            <td className={valueCell}>
              <input
                id="report-interval"
                type="number"
                min={0}
                value={f.interval}
                onChange={(e) => f.setInterval(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                placeholder={t('minutes (blank = one-off)')}
                className={classicInput}
              />
            </td>
          </tr>
        </tbody>
      </table>
      <div className="flex items-center justify-end gap-2 p-2">
        <ClassicButton type="submit" tone="primary" disabled={f.pending}>{t('Save')}</ClassicButton>
      </div>
    </form>
  );
}
