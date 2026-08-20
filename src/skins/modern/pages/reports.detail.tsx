import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Calendar,
  FileText,
  Filter as FilterIcon,
  Loader2,
  Save,
  Trash2,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import type { Report } from '@/api/reports';
import { useDocumentTitle } from '../layouts/useDocumentTitle';
import { EventsPerHourChart } from '@/features/reports/EventsPerHourChart';
import {
  useReportChart,
  useReportDetailPage,
  useReportForm,
} from '@/features/reports/useReportDetailPage';

/** Report detail — Mission Control. Edit form + events-per-hour chart. */
export default function ReportDetailPage({ reportId }: { reportId: number }) {
  const { t } = useTranslation();
  const s = useReportDetailPage(reportId);
  useDocumentTitle(s.report?.name || t('Report'));

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={t('Report')}>
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <Link
            to="/reports"
            className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.18em] text-text-muted hover:text-cyan transition-colors"
          >
            <ArrowLeft size={12} className="rtl:-scale-x-100" />
            {t('Back to reports')}
          </Link>
        </div>

        {s.isLoading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-text-muted text-sm">
            <Loader2 size={14} className="animate-spin" />
            {t('Loading report…')}
          </div>
        ) : s.isError || !s.report ? (
          <Panel>
            <div className="py-8 text-center text-text-muted text-sm">
              {t('Could not load report #{{id}}.', { id: reportId })}
            </div>
          </Panel>
        ) : (
          <ReportDetailBody
            report={s.report}
            filters={s.filters}
            onSaved={s.onSaved}
          />
        )}
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
      <Panel title={t('Report')} icon={<FileText size={16} />} className="mb-6">
        <form onSubmit={f.submit} className="space-y-3">
          <Field label={t('Name')}>
            <input
              value={f.name}
              onChange={(e) => f.setName(e.target.value)}
              placeholder={t('Weekly motion report')}
              className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
            />
          </Field>
          <Field label={t('Filter')} icon={<FilterIcon size={11} />}>
            <select
              value={f.filterId}
              onChange={(e) =>
                f.setFilterId(e.target.value === '' ? '' : parseInt(e.target.value, 10))
              }
              className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
            >
              <option value="">{t('— none —')}</option>
              {filters.map((fl) => (
                <option key={fl.id} value={fl.id}>
                  {fl.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-center gap-3">
            <Field label={t('Start')} icon={<Calendar size={11} />}>
              <input
                type="datetime-local"
                value={f.start}
                onChange={(e) => f.setStart(e.target.value)}
                className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
              />
            </Field>
            <Field label={t('End')}>
              <input
                type="datetime-local"
                value={f.end}
                onChange={(e) => f.setEnd(e.target.value)}
                className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
              />
            </Field>
          </div>
          <Field label={t('Interval')}>
            <input
              type="number"
              min={0}
              value={f.interval}
              onChange={(e) =>
                f.setInterval(e.target.value === '' ? '' : parseInt(e.target.value, 10))
              }
              placeholder={t('minutes (blank = one-off)')}
              className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
            />
          </Field>

          <div className="flex items-center justify-end gap-2 pt-1">
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
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border-2 border-crimson/60 bg-crimson/15 text-crimson hover:bg-crimson/25 transition-colors disabled:opacity-50"
            >
              <Trash2 size={12} />
              {t('Delete')}
            </button>
            <button
              type="submit"
              disabled={f.savePending}
              className={clsx(
                'flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border-2 transition-colors',
                'border-cyan/60 bg-cyan/15 text-cyan hover:bg-cyan/25',
                'disabled:opacity-50',
              )}
            >
              {f.savePending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Save size={12} />
              )}
              {t('Save')}
            </button>
          </div>

          {f.saveError && (
            <p className="text-xs text-crimson">{t('Save failed. Try again.')}</p>
          )}
          {f.saveSuccess && (
            <p className="text-xs text-emerald">{t('Saved.')}</p>
          )}
        </form>
      </Panel>

      <Panel title={t('Events per hour')} icon={<FileText size={16} />}>
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
        className="py-12 text-center text-text-muted text-sm"
        data-testid="report-chart-empty"
      >
        {t('Select a Filter to populate the chart.')}
      </div>
    );
  }

  if (chart.isLoading) {
    return (
      <div className="py-12 flex items-center justify-center gap-2 text-text-muted text-sm">
        <Loader2 size={14} className="animate-spin" />
        {t('Loading events…')}
      </div>
    );
  }

  if (chart.filterError) {
    return (
      <div className="py-12 text-center text-text-muted text-sm">
        {t('Could not load filter #{{id}}.', { id: filterId })}
      </div>
    );
  }

  if (chart.buckets.length === 0) {
    return (
      <div
        className="py-12 text-center text-text-muted text-sm"
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

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 flex-1">
      <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted w-16 flex items-center gap-1">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}
