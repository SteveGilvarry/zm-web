import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { FileText, Plus, Trash2, Calendar, Filter as FilterIcon } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { formatDateRange } from '@/features/reports/datetime';
import { useDocumentTitle } from '../layouts/useDocumentTitle';
import {
  useCreateReportForm,
  useReportsListPage,
} from '@/features/reports/useReportsListPage';

/** Reports list — Mission Control. Saved reports table + inline create form. */
export default function ReportsListPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('Reports'));
  const s = useReportsListPage();
  const { reports, filters, filterLookup, showCreate } = s;

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={t('Reports')}>
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-mono uppercase tracking-[0.18em] text-text-muted">
            {t('Saved reports')}
          </h2>
          <RequirePerm feature="events" level="Edit">
          <button
            onClick={s.toggleCreate}
            className={clsx(
              'flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border-2 transition-all',
              showCreate
                ? 'border-cyan/60 bg-cyan/15 text-cyan'
                : 'border-border-subtle bg-surface/50 text-text-muted hover:border-cyan/40 hover:text-cyan',
            )}
          >
            <Plus size={12} />
            {t('New report')}
          </button>
          </RequirePerm>
        </div>

        {showCreate && (
          <Panel title={t('New report')} icon={<FileText size={16} />} className="mb-6">
            <CreateReportForm filters={filters} onCreated={s.onCreated} />
          </Panel>
        )}

        <Panel icon={<FileText size={16} />} noPadding>
          <QueryState
            isLoading={s.isLoading}
            isError={s.isError}
            error={s.error}
            onRetry={s.refetch}
            empty={reports.length === 0}
            emptyMessage={t('No reports yet. Create one to start.')}
          >
            <table className="w-full text-sm">
              <thead className="bg-surface/70 border-b border-border-subtle text-[10px] uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="px-3 py-2 text-start">{t('Name')}</th>
                  <th className="px-3 py-2 text-start">{t('Filter')}</th>
                  <th className="px-3 py-2 text-start">{t('Range')}</th>
                  <th className="px-3 py-2 text-start">{t('Interval')}</th>
                  <th className="px-3 py-2 text-end"></th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-b border-border-subtle/50 hover:bg-surface/30">
                    <td className="px-3 py-2 text-text-primary">
                      <Link
                        to="/reports/$reportId"
                        params={{ reportId: String(r.id) }}
                        className="text-cyan hover:underline"
                      >
                        {r.name || <span className="text-text-muted italic">{t('untitled')}</span>}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-cyan text-xs">
                      {r.filter_id != null
                        ? (filterLookup.get(r.filter_id) ?? `#${r.filter_id}`)
                        : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2 text-text-secondary text-xs font-mono">
                      {formatDateRange(r.start_date_time, r.end_date_time)}
                    </td>
                    <td className="px-3 py-2 text-text-secondary text-xs font-mono">
                      {r.interval != null ? t('{{count}} min', { count: r.interval }) : t('one-off')}
                    </td>
                    <td className="px-3 py-2 text-end">
                      <RequirePerm feature="events" level="Edit">
                        <button
                          onClick={() => {
                            if (confirm(t('Delete report "{{name}}"?', { name: r.name ?? `#${r.id}` }))) {
                              s.remove(r.id);
                            }
                          }}
                          aria-label={t('Delete report')}
                          className="p-1 rounded text-text-muted hover:text-crimson hover:bg-crimson/10 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </RequirePerm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </QueryState>
        </Panel>
      </main>
    </AppShell>
  );
}

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
          onChange={(e) => f.setFilterId(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
          className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
        >
          <option value="">{t('— none —')}</option>
          {filters.map((fl) => (
            <option key={fl.id} value={fl.id}>{fl.name}</option>
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
          onChange={(e) => f.setInterval(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
          placeholder={t('minutes (blank = one-off)')}
          className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
        />
      </Field>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="submit"
          disabled={f.pending}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border-2 border-cyan/60 bg-cyan/15 text-cyan hover:bg-cyan/25 transition-colors disabled:opacity-50"
        >
          <Plus size={12} />
          {t('Create report')}
        </button>
      </div>
    </form>
  );
}

function Field({
  label, icon, children,
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
