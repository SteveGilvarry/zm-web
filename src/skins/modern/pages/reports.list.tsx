import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { useDateRangeFormat } from '@/features/reports/datetime';
import { useDocumentTitle } from '../layouts/useDocumentTitle';
import {
  useCreateReportForm,
  useReportsListPage,
} from '@/features/reports/useReportsListPage';

const field = clsx(
  'bg-surface border border-border-subtle rounded px-2 py-1 text-sm',
  'text-fg placeholder:text-fg-faint',
  'focus:outline-none focus:border-accent transition-colors',
);

/**
 * Reports list — the modern skin.
 *
 * One action line, then the saved-reports table owning the rest of the
 * height, then a status bar (docs/DESIGN.md). The create form drops in
 * under the line rather than pushing the table off screen.
 */
export default function ReportsListPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('Reports'));
  const s = useReportsListPage();
  const formatDateRange = useDateRangeFormat();
  const { reports, filters, filterLookup, showCreate } = s;

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={t('Reports')}>
      <main className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center gap-2 px-3 h-11 shrink-0 border-b border-border-subtle bg-surface">
          <span className="text-sm text-fg-muted">{t('Saved reports')}</span>
          <span className="ms-auto" />
          <RequirePerm feature="events" level="Edit">
            <button
              onClick={s.toggleCreate}
              aria-expanded={showCreate}
              className={clsx(
                'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
                showCreate ? 'bg-accent/15 text-accent' : 'text-fg-dim hover:text-fg',
              )}
            >
              <Plus size={12} aria-hidden />
              {t('New report')}
            </button>
          </RequirePerm>
        </div>

        {showCreate && (
          <div className="shrink-0 border-b border-border-subtle bg-surface px-3 py-3">
            <CreateReportForm filters={filters} onCreated={s.onCreated} />
          </div>
        )}

        {/* The table is the page: it scrolls under its own pinned header. */}
        <div className="flex-1 min-h-0 overflow-auto p-3">
          <QueryState
            isLoading={s.isLoading}
            isError={s.isError}
            error={s.error}
            onRetry={s.refetch}
            empty={reports.length === 0}
            emptyMessage={t('No reports yet. Create one to start.')}
          >
            <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-surface border-b border-border-subtle">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-start text-xs font-medium text-fg-dim">{t('Name')}</th>
                    <th scope="col" className="px-3 py-2 text-start text-xs font-medium text-fg-dim">{t('Filter')}</th>
                    <th scope="col" className="px-3 py-2 text-start text-xs font-medium text-fg-dim">{t('Range')}</th>
                    <th scope="col" className="px-3 py-2 text-start text-xs font-medium text-fg-dim">{t('Interval')}</th>
                    <th scope="col" className="w-10 px-3 py-2 text-end"></th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-2 transition-colors">
                      <td className="px-3 py-1">
                        <Link
                          to="/reports/$reportId"
                          params={{ reportId: String(r.id) }}
                          className="text-fg hover:text-accent transition-colors"
                        >
                          {r.name || <span className="text-fg-dim italic">{t('untitled')}</span>}
                        </Link>
                      </td>
                      <td className="px-3 py-1 text-fg-muted">
                        {r.filter_id != null
                          ? (filterLookup.get(r.filter_id) ?? `#${r.filter_id}`)
                          : <span className="text-fg-dim">—</span>}
                      </td>
                      <td className="px-3 py-1 font-mono tabular-nums text-fg-muted whitespace-nowrap">
                        {formatDateRange(r.start_date_time, r.end_date_time)}
                      </td>
                      <td className="px-3 py-1 font-mono tabular-nums text-fg-muted">
                        {r.interval != null ? t('{{count}} min', { count: r.interval }) : t('one-off')}
                      </td>
                      <td className="px-3 py-1 text-end">
                        <RequirePerm feature="events" level="Edit">
                          <button
                            onClick={() => {
                              if (confirm(t('Delete report "{{name}}"?', { name: r.name ?? `#${r.id}` }))) {
                                s.remove(r.id);
                              }
                            }}
                            aria-label={t('Delete report')}
                            className="inline-flex p-1 rounded text-fg-dim hover:text-danger hover:bg-surface-3 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </RequirePerm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </QueryState>
        </div>

        <div className="flex items-center gap-3 px-3 py-2 shrink-0 border-t border-border-subtle bg-surface text-xs text-fg-dim">
          <span>{t('{{count}} report', { count: reports.length })}</span>
        </div>
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
    <form onSubmit={f.submit} className="flex flex-wrap items-end gap-3">
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
          onChange={(e) => f.setFilterId(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
          className={clsx(field, 'w-48 cursor-pointer')}
        >
          <option value="">{t('— none —')}</option>
          {filters.map((fl) => (
            <option key={fl.id} value={fl.id}>{fl.name}</option>
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
          onChange={(e) => f.setInterval(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
          placeholder={t('minutes (blank = one-off)')}
          className={clsx(field, 'w-48')}
        />
      </Field>

      <button
        type="submit"
        disabled={f.pending}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent text-accent-fg text-xs font-medium hover:bg-accent-dim transition-colors disabled:opacity-50"
      >
        <Plus size={12} aria-hidden />
        {t('Create report')}
      </button>
    </form>
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
