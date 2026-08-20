import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, Save, Trash2 } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import type { Report } from '@/api/reports';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { EventsPerHourChart } from '@/features/reports/EventsPerHourChart';
import {
  useReportChart,
  useReportDetailPage,
  useReportForm,
} from '@/features/reports/useReportDetailPage';
import { ClassicButton, ClassicToolbar } from '@/skins/classic/components/events/primitives';
import { classicInput, classicSelect } from '@/skins/classic/components/events/styles';

/**
 * Report detail — classic skin. Legacy toolbar (back, save, delete) over a
 * two-column form table, events-per-hour chart beneath. Same data as
 * Mission Control via `useReportDetailPage`.
 */
export default function ClassicReportDetailPage({ reportId }: { reportId: number }) {
  const { t } = useTranslation();
  const s = useReportDetailPage(reportId);
  useDocumentTitle(s.report?.name || t('Report'));

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={t('Report')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-3">
          <QueryState isLoading={s.isLoading} isError={s.isError || !s.report}>
            {s.report && (
              <ReportDetailBody report={s.report} filters={s.filters} onSaved={s.onSaved} />
            )}
          </QueryState>
        </div>
      </main>
    </AppShell>
  );
}

const backButton =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-sm font-medium whitespace-nowrap ' +
  'bg-[#e9ecef] border-[#adb5bd] text-zinc-800 hover:bg-[#dde1e5]';
const labelCell = 'w-44 px-3 py-2 text-end align-middle font-medium text-zinc-800 border-b border-[#dee2e6]';
const valueCell = 'px-3 py-2 align-middle border-b border-[#dee2e6]';

function ReportDetailBody({
  report,
  filters,
  onSaved,
}: {
  report: Report;
  filters: Array<{ id: number; name: string }>;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const f = useReportForm(report, onSaved);

  return (
    <form onSubmit={f.submit} className="space-y-3">
      <ClassicToolbar>
        <Link to="/reports" className={backButton} aria-label={t('Back')} title={t('Back')}>
          <ArrowLeft size={14} className="rtl:-scale-x-100" aria-hidden />
        </Link>
        <RequirePerm feature="events" level="Edit">
          <ClassicButton type="submit" tone="primary" disabled={f.savePending} aria-label={t('Save')} title={t('Save')}>
            {f.savePending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Save size={14} aria-hidden />}
          </ClassicButton>
          <ClassicButton
            tone="danger"
            disabled={f.deletePending}
            aria-label={t('Delete')}
            title={t('Delete')}
            onClick={() => {
              if (confirm(t('Delete report "{{name}}"?', { name: report.name ?? `#${report.id}` }))) {
                f.remove();
              }
            }}
          >
            <Trash2 size={14} aria-hidden />
          </ClassicButton>
        </RequirePerm>
        {f.saveError && <span className="text-sm text-[#a94442]">{t('Save failed. Try again.')}</span>}
        {f.saveSuccess && <span className="text-sm text-[#3c763d]">{t('Saved.')}</span>}
      </ClassicToolbar>

      <div className="bg-white border border-[#dee2e6]">
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
      </div>

      <section className="bg-white border border-[#dee2e6]">
        <h2 className="px-3 py-2 text-sm font-semibold text-zinc-700 bg-[#e9ecef] border-b border-[#dee2e6]">
          {t('Events per hour')}
        </h2>
        <div className="p-3">
          <ReportChart filterId={f.filterId === '' ? null : f.filterId} />
        </div>
      </section>
    </form>
  );
}

function ReportChart({ filterId }: { filterId: number | null }) {
  const { t } = useTranslation();
  const chart = useReportChart(filterId);

  if (filterId == null) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500" data-testid="report-chart-empty">
        {t('Select a Filter to populate the chart.')}
      </p>
    );
  }
  if (chart.isLoading) {
    return (
      <p className="py-8 flex items-center justify-center gap-2 text-sm text-zinc-500">
        <Loader2 size={14} className="animate-spin" aria-hidden />
        {t('Loading events…')}
      </p>
    );
  }
  if (chart.filterError) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        {t('Could not load filter #{{id}}.', { id: filterId })}
      </p>
    );
  }
  if (chart.buckets.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500" data-testid="report-chart-no-data">
        {t('No matching events in the most recent 500.')}
      </p>
    );
  }
  return (
    <div dir="ltr">
      <EventsPerHourChart buckets={chart.buckets} />
    </div>
  );
}
