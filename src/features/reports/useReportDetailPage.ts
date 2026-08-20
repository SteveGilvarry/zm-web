import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { getReport, updateReport, deleteReport, type Report } from '@/api/reports';
import { listFilters, getFilter, parseFilterQuery } from '@/api/filters';
import { getEvents } from '@/api/events';
import { evaluateFilter } from '@/features/filters/evaluate';
import { bucketEventsByHour, type DailyBucket } from './bucketEventsByHour';
import { toLocalDatetime } from './datetime';

export interface ReportDetailPageState {
  isAuthenticated: boolean;
  isLoading: boolean;
  /** True when the fetch failed or returned nothing. */
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  report: Report | undefined;
  filters: Array<{ id: number; name: string }>;
  /** Invalidate this report + the list after a successful save. */
  onSaved: () => void;
}

/** Loads one report and the filter list for its editor. */
export function useReportDetailPage(id: number): ReportDetailPageState {
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

  return {
    isAuthenticated,
    isLoading: reportQ.isLoading,
    isError: reportQ.isError || (!reportQ.isLoading && !reportQ.data),
    error: (reportQ.error as Error | null) ?? null,
    refetch: () => { reportQ.refetch(); },
    report: reportQ.data,
    filters: filtersQ.data?.items ?? [],
    onSaved: () => {
      qc.invalidateQueries({ queryKey: ['report', id] });
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
  };
}

export interface ReportFormState {
  name: string;
  setName: (v: string) => void;
  filterId: number | '';
  setFilterId: (v: number | '') => void;
  start: string;
  setStart: (v: string) => void;
  end: string;
  setEnd: (v: string) => void;
  interval: number | '';
  setInterval: (v: number | '') => void;
  submit: (e: FormEvent) => void;
  savePending: boolean;
  saveError: boolean;
  saveSuccess: boolean;
  remove: () => void;
  deletePending: boolean;
}

/** Edit-form draft, PATCH and DELETE for a loaded report. */
export function useReportForm(report: Report, onSaved: () => void): ReportFormState {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  const [name, setName] = useState(report.name ?? '');
  const [filterId, setFilterId] = useState<number | ''>(report.filter_id ?? '');
  const [start, setStart] = useState<string>(
    report.start_date_time ? toLocalDatetime(new Date(report.start_date_time)) : '',
  );
  const [end, setEnd] = useState<string>(
    report.end_date_time ? toLocalDatetime(new Date(report.end_date_time)) : '',
  );
  const [interval, setInterval] = useState<number | ''>(report.interval ?? '');

  // If the report changes (route navigation reuses this component, or a save
  // refetches it), reset the draft. Done during render — the React-sanctioned
  // way to derive state from props without an extra effect pass.
  const syncKey = [
    report.id, report.name, report.filter_id,
    report.start_date_time, report.end_date_time, report.interval,
  ].join('\u0000');
  const [syncedKey, setSyncedKey] = useState(syncKey);
  if (syncedKey !== syncKey) {
    setSyncedKey(syncKey);
    setName(report.name ?? '');
    setFilterId(report.filter_id ?? '');
    setStart(
      report.start_date_time ? toLocalDatetime(new Date(report.start_date_time)) : '',
    );
    setEnd(
      report.end_date_time ? toLocalDatetime(new Date(report.end_date_time)) : '',
    );
    setInterval(report.interval ?? '');
  }

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
    onError: toast.apiError,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteReport(report.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports'] });
      navigate({ to: '/reports' });
    },
    onError: toast.apiError,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  return {
    name, setName,
    filterId, setFilterId,
    start, setStart,
    end, setEnd,
    interval, setInterval,
    submit,
    savePending: saveMutation.isPending,
    saveError: saveMutation.isError,
    saveSuccess: saveMutation.isSuccess,
    remove: () => deleteMutation.mutate(),
    deletePending: deleteMutation.isPending,
  };
}

export interface ReportChartState {
  isLoading: boolean;
  filterError: boolean;
  buckets: DailyBucket[];
}

/**
 * Re-runs the linked filter's query_json against the most recent events and
 * buckets the matches per hour. Idle (no fetches) when `filterId` is null.
 */
export function useReportChart(filterId: number | null): ReportChartState {
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
    const parsed = parseFilterQuery(filterQ.data.query_json);
    // An unreadable query_json cannot be evaluated; chart nothing rather than
    // "everything matched".
    const matched = parsed.ok ? evaluateFilter(parsed.query, eventsQ.data.items) : [];
    return bucketEventsByHour(matched);
  }, [filterQ.data, eventsQ.data]);

  return {
    isLoading: filterQ.isLoading || eventsQ.isLoading,
    filterError: filterQ.isError,
    buckets,
  };
}
