import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { clsx } from 'clsx';
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
import { useAuthStore } from '@/stores/auth';
import {
  getReport,
  updateReport,
  deleteReport,
  type Report,
} from '@/api/reports';
import { listFilters, getFilter, parseFilterQuery } from '@/api/filters';
import { getEvents } from '@/api/events';
import { evaluateFilter } from '@/features/filters/evaluate';
import {
  bucketEventsByHour,
  type DailyBucket,
} from '@/features/reports/bucketEventsByHour';
import { EventsPerHourChart } from '@/features/reports/EventsPerHourChart';

export const Route = createFileRoute('/reports/$reportId')({
  component: ReportDetailPage,
});

function ReportDetailPage() {
  const { reportId } = Route.useParams();
  const id = parseInt(reportId, 10);
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();

  const reportQ = useQuery({
    queryKey: ['report', id],
    queryFn: () => getReport(id),
    enabled: isAuthenticated && Number.isFinite(id),
  });
  const filtersQ = useQuery({
    queryKey: ['filters'],
    queryFn: () => listFilters({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) return null;

  return (
    <AppShell title="Report">
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <Link
            to="/reports"
            className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.18em] text-text-muted hover:text-cyan transition-colors"
          >
            <ArrowLeft size={12} />
            Back to reports
          </Link>
        </div>

        {reportQ.isLoading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-text-muted text-sm">
            <Loader2 size={14} className="animate-spin" />
            Loading report…
          </div>
        ) : reportQ.isError || !reportQ.data ? (
          <Panel>
            <div className="py-8 text-center text-text-muted text-sm">
              Could not load report #{reportId}.
            </div>
          </Panel>
        ) : (
          <ReportDetailBody
            report={reportQ.data}
            filters={filtersQ.data?.items ?? []}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ['report', id] });
              qc.invalidateQueries({ queryKey: ['reports'] });
            }}
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
  const qc = useQueryClient();

  const [name, setName] = useState(report.name ?? '');
  const [filterId, setFilterId] = useState<number | ''>(report.filter_id ?? '');
  const [start, setStart] = useState<string>(
    report.start_date_time ? toLocalDatetime(new Date(report.start_date_time)) : '',
  );
  const [end, setEnd] = useState<string>(
    report.end_date_time ? toLocalDatetime(new Date(report.end_date_time)) : '',
  );
  const [interval, setInterval] = useState<number | ''>(report.interval ?? '');

  // If the report id changes (route navigation reuses this component), reset.
  useEffect(() => {
    setName(report.name ?? '');
    setFilterId(report.filter_id ?? '');
    setStart(
      report.start_date_time ? toLocalDatetime(new Date(report.start_date_time)) : '',
    );
    setEnd(
      report.end_date_time ? toLocalDatetime(new Date(report.end_date_time)) : '',
    );
    setInterval(report.interval ?? '');
  }, [report.id, report.name, report.filter_id, report.start_date_time, report.end_date_time, report.interval]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateReport(report.id, {
        name: name.trim() || null,
        filter_id: filterId === '' ? null : filterId,
        start_date_time: start ? new Date(start).toISOString() : '',
        end_date_time: end ? new Date(end).toISOString() : '',
        interval: interval === '' ? null : interval,
      }),
    onSuccess: () => onSaved(),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteReport(report.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports'] });
      // Navigate back to the list. Using location rather than router.navigate
      // keeps this component decoupled from the router dependency injection.
      window.location.href = '/reports';
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  return (
    <>
      <Panel title="Report" icon={<FileText size={16} />} className="mb-6">
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
              onChange={(e) =>
                setFilterId(e.target.value === '' ? '' : parseInt(e.target.value, 10))
              }
              className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
            >
              <option value="">— none —</option>
              {filters.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
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
              onChange={(e) =>
                setInterval(e.target.value === '' ? '' : parseInt(e.target.value, 10))
              }
              placeholder="minutes (blank = one-off)"
              className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
            />
          </Field>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(`Delete report "${report.name ?? `#${report.id}`}"?`)
                ) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border-2 border-crimson/60 bg-crimson/15 text-crimson hover:bg-crimson/25 transition-colors disabled:opacity-50"
            >
              <Trash2 size={12} />
              Delete
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className={clsx(
                'flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border-2 transition-colors',
                'border-cyan/60 bg-cyan/15 text-cyan hover:bg-cyan/25',
                'disabled:opacity-50',
              )}
            >
              {saveMutation.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Save size={12} />
              )}
              Save
            </button>
          </div>

          {saveMutation.isError && (
            <p className="text-xs text-crimson">Save failed. Try again.</p>
          )}
          {saveMutation.isSuccess && (
            <p className="text-xs text-emerald">Saved.</p>
          )}
        </form>
      </Panel>

      <Panel title="Events per hour" icon={<FileText size={16} />}>
        <ReportChart filterId={filterId === '' ? null : filterId} />
      </Panel>
    </>
  );
}

function ReportChart({ filterId }: { filterId: number | null }) {
  // Fetch the underlying filter row so we can re-run its query_json against
  // the event list. No filter selected → render the empty state.
  const filterQ = useQuery({
    queryKey: ['filter', filterId],
    queryFn: () => getFilter(filterId!),
    enabled: filterId != null,
  });

  // Pull a generous slice of recent events for client-side evaluation. The
  // legacy chart sums against every matching event — page_size=500 keeps
  // the request manageable while still covering a typical install's
  // last-month dataset.
  const eventsQ = useQuery({
    queryKey: ['events', 'reportChart'],
    queryFn: () => getEvents({ page: 1, page_size: 500 }),
    enabled: filterId != null,
  });

  const buckets = useMemo<DailyBucket[]>(() => {
    if (!filterQ.data || !eventsQ.data) return [];
    const query = parseFilterQuery(filterQ.data.query_json);
    const matched = evaluateFilter(query, eventsQ.data.items);
    return bucketEventsByHour(matched);
  }, [filterQ.data, eventsQ.data]);

  if (filterId == null) {
    return (
      <div
        className="py-12 text-center text-text-muted text-sm"
        data-testid="report-chart-empty"
      >
        Select a Filter to populate the chart.
      </div>
    );
  }

  if (filterQ.isLoading || eventsQ.isLoading) {
    return (
      <div className="py-12 flex items-center justify-center gap-2 text-text-muted text-sm">
        <Loader2 size={14} className="animate-spin" />
        Loading events…
      </div>
    );
  }

  if (filterQ.isError) {
    return (
      <div className="py-12 text-center text-text-muted text-sm">
        Could not load filter #{filterId}.
      </div>
    );
  }

  if (buckets.length === 0) {
    return (
      <div
        className="py-12 text-center text-text-muted text-sm"
        data-testid="report-chart-no-data"
      >
        No matching events in the most recent 500.
      </div>
    );
  }

  return <EventsPerHourChart buckets={buckets} />;
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

function toLocalDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
