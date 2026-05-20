import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { clsx } from 'clsx';
import { FileText, Plus, Trash2, Calendar, Filter as FilterIcon } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { useAuthStore } from '@/stores/auth';
import { listReports, createReport, deleteReport } from '@/api/reports';
import { listFilters } from '@/api/filters';

export const Route = createFileRoute('/reports/')({
  component: ReportsPage,
});

function ReportsPage() {
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();

  const reportsQ = useQuery({
    queryKey: ['reports'],
    queryFn: () => listReports({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const filtersQ = useQuery({
    queryKey: ['filters'],
    queryFn: () => listFilters({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const reports = reportsQ.data?.items ?? [];
  const filters = filtersQ.data?.items ?? [];
  const filterLookup = new Map(filters.map((f) => [f.id, f.name]));

  const [showCreate, setShowCreate] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteReport(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  });

  if (!isAuthenticated) return null;

  return (
    <AppShell title="Reports">
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-mono uppercase tracking-[0.18em] text-text-muted">
            Saved reports
          </h2>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className={clsx(
              'flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border-2 transition-all',
              showCreate
                ? 'border-cyan/60 bg-cyan/15 text-cyan'
                : 'border-border-subtle bg-surface/50 text-text-muted hover:border-cyan/40 hover:text-cyan',
            )}
          >
            <Plus size={12} />
            New report
          </button>
        </div>

        {showCreate && (
          <Panel title="New report" icon={<FileText size={16} />} className="mb-6">
            <CreateReportForm
              filters={filters}
              onCreated={() => {
                qc.invalidateQueries({ queryKey: ['reports'] });
                setShowCreate(false);
              }}
            />
          </Panel>
        )}

        <Panel icon={<FileText size={16} />} noPadding>
          {reports.length === 0 ? (
            <div className="py-12 text-center text-text-muted text-sm">
              No reports yet. Create one to start.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface/70 border-b border-border-subtle text-[10px] uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Filter</th>
                  <th className="px-3 py-2 text-left">Range</th>
                  <th className="px-3 py-2 text-left">Interval</th>
                  <th className="px-3 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-b border-border-subtle/50 hover:bg-surface/30">
                    <td className="px-3 py-2 text-text-primary">
                      {r.name || <span className="text-text-muted italic">untitled</span>}
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
                      {r.interval != null ? `${r.interval} min` : 'one-off'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => {
                          if (confirm(`Delete report "${r.name ?? `#${r.id}`}"?`)) {
                            deleteMutation.mutate(r.id);
                          }
                        }}
                        aria-label="Delete report"
                        className="p-1 rounded text-text-muted hover:text-crimson hover:bg-crimson/10 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
  const [name, setName] = useState('');
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toLocalDatetime(d);
  });
  const [end, setEnd] = useState(() => toLocalDatetime(new Date()));
  const [filterId, setFilterId] = useState<number | ''>('');
  const [interval, setInterval] = useState<number | ''>('');

  const create = useMutation({
    mutationFn: () =>
      createReport({
        name: name.trim() || null,
        start_date_time: new Date(start).toISOString(),
        end_date_time: new Date(end).toISOString(),
        filter_id: filterId === '' ? null : filterId,
        interval: interval === '' ? null : interval,
      }),
    onSuccess: onCreated,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Weekly motion report"
          className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
        />
      </Field>
      <Field label="Filter" icon={<FilterIcon size={11} />}>
        <select
          value={filterId}
          onChange={(e) => setFilterId(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
          className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
        >
          <option value="">— none —</option>
          {filters.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </Field>
      <div className="flex items-center gap-3">
        <Field label="Start" icon={<Calendar size={11} />}>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
          />
        </Field>
        <Field label="End">
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
          />
        </Field>
      </div>
      <Field label="Interval">
        <input
          type="number"
          min={0}
          value={interval}
          onChange={(e) => setInterval(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
          placeholder="minutes (blank = one-off)"
          className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
        />
      </Field>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="submit"
          disabled={create.isPending}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border-2 border-cyan/60 bg-cyan/15 text-cyan hover:bg-cyan/25 transition-colors disabled:opacity-50"
        >
          <Plus size={12} />
          Create report
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

function toLocalDatetime(d: Date): string {
  // <input type="datetime-local"> expects 'YYYY-MM-DDTHH:MM'.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return '—';
  const s = start ? new Date(start).toLocaleString() : '—';
  const e = end ? new Date(end).toLocaleString() : '—';
  return `${s} → ${e}`;
}
