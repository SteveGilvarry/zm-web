import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, Save, Trash2 } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import type { Report } from '@/api/reports';
import { useDocumentTitle } from '../layouts/useDocumentTitle';
import { EventsPerHourChart } from '@/features/reports/EventsPerHourChart';
import {
  useReportChart,
  useReportDetailPage,
  useReportForm,
} from '@/features/reports/useReportDetailPage';

const field = clsx(
  'bg-surface border border-border-subtle rounded px-2 py-1 text-sm',
  'text-fg placeholder:text-fg-faint',
  'focus:outline-none focus:border-accent transition-colors',
);

/**
 * Report detail — the modern skin. A back line that stays put, then the
 * edit form and the events-per-hour chart in the scrolling body.
 */
export default function ReportDetailPage({ reportId }: { reportId: number }) {
  const { t } = useTranslation();
  const s = useReportDetailPage(reportId);
  useDocumentTitle(s.report?.name || t('Report'));

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={t('Report')}>
      <main className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center gap-2 px-3 h-11 shrink-0 border-b border-border-subtle bg-surface">
          <Link
            to="/reports"
            className="flex items-center gap-1.5 text-xs text-fg-dim hover:text-fg transition-colors"
          >
            <ArrowLeft size={14} className="rtl:-scale-x-100" aria-hidden />
            {t('Back to reports')}
          </Link>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
          <QueryState
            isLoading={s.isLoading}
            isError={s.isError}
            error={s.error}
            onRetry={s.refetch}
            empty={!s.report}
            emptyMessage={t('Could not load report #{{id}}.', { id: reportId })}
          >
            {s.report && (
              <ReportDetailBody
                report={s.report}
                filters={s.filters}
                onSaved={s.onSaved}
              />
            )}
          </QueryState>
        </div>
      </main>
    </AppShell>
  );
}

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
    <>
      <Panel title={t('Report')}>
        <form onSubmit={f.submit} className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('Name')}>
              <input
                value={f.name}
                onChange={(e) => f.setName(e.target.value)}
                placeholder={t('Weekly motion report')}
                className={clsx(field, 'w-56')}
              />
            </Field>
            <Field label={t('Filter')}>
              <select
                value={f.filterId}
                onChange={(e) =>
                  f.setFilterId(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                }
                className={clsx(field, 'w-48 cursor-pointer')}
              >
                <option value="">{t('— none —')}</option>
                {filters.map((fl) => (
                  <option key={fl.id} value={fl.id}>
                    {fl.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('Start')}>
              <input
                type="datetime-local"
                value={f.start}
                onChange={(e) => f.setStart(e.target.value)}
                className={field}
              />
            </Field>
            <Field label={t('End')}>
              <input
                type="datetime-local"
                value={f.end}
                onChange={(e) => f.setEnd(e.target.value)}
                className={field}
              />
            </Field>
            <Field label={t('Interval')}>
              <input
                type="number"
                min={0}
                value={f.interval}
                onChange={(e) =>
                  f.setInterval(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                }
                placeholder={t('minutes (blank = one-off)')}
                className={clsx(field, 'w-48')}
              />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <RequirePerm feature="events" level="Edit">
              <button
                type="button"
                onClick={() => {
                  if (
                    confirm(t('Delete report "{{name}}"?', { name: report.name ?? `#${report.id}` }))
                  ) {
                    f.remove();
                  }
                }}
                disabled={f.deletePending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
              >
                <Trash2 size={12} aria-hidden />
                {t('Delete')}
              </button>
              <button
                type="submit"
                disabled={f.savePending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent text-accent-fg text-xs font-medium hover:bg-accent-dim transition-colors disabled:opacity-50"
              >
                {f.savePending ? (
                  <Loader2 size={12} className="animate-spin" aria-hidden />
                ) : (
                  <Save size={12} aria-hidden />
                )}
                {t('Save')}
              </button>
            </RequirePerm>
          </div>

          {f.saveError && (
            <p role="alert" className="text-xs text-danger">{t('Save failed. Try again.')}</p>
          )}
          {f.saveSuccess && (
            <p role="status" className="text-xs text-ok">{t('Saved.')}</p>
          )}
        </form>
      </Panel>

      <Panel title={t('Events per hour')}>
        <ReportChart filterId={f.filterId === '' ? null : f.filterId} />
      </Panel>
    </>
  );
}

function ReportChart({ filterId }: { filterId: number | null }) {
  const { t } = useTranslation();
  const chart = useReportChart(filterId);

  if (filterId == null) {
    return (
      <div
        className="py-12 text-center text-fg-dim text-sm"
        data-testid="report-chart-empty"
      >
        {t('Select a Filter to populate the chart.')}
      </div>
    );
  }

  if (chart.isLoading) {
    return (
      <div className="py-12 flex items-center justify-center gap-2 text-fg-dim text-sm">
        <Loader2 size={14} className="animate-spin" aria-hidden />
        {t('Loading events…')}
      </div>
    );
  }

  if (chart.filterError) {
    return (
      <div className="py-12 text-center text-fg-dim text-sm">
        {t('Could not load filter #{{id}}.', { id: filterId })}
      </div>
    );
  }

  if (chart.buckets.length === 0) {
    return (
      <div
        className="py-12 text-center text-fg-dim text-sm"
        data-testid="report-chart-no-data"
      >
        {t('No matching events in the most recent 500.')}
      </div>
    );
  }

  return (
    <div dir="ltr">
      <EventsPerHourChart buckets={chart.buckets} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-fg-dim">
      {label}
      {children}
    </label>
  );
}
