import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { getReport, updateReport, deleteReport, type Report } from '@/api/reports';
import { listFilters, getFilter, parseFilterQuery, previewFilter, type FilterAstQuery } from '@/api/filters';
import { getEvents } from '@/api/events';
import { evaluateFilter } from '@/features/filters/evaluate';
import { termsToAst } from '@/features/filters/toAst';
import type { ZmEvent } from '@/types';
import { bucketEventsByHour, type DailyBucket } from './bucketEventsByHour';
import { toLocalDatetime, toApiDateTime} from './datetime';

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
        start_date_time: start ? toApiDateTime(start) : '',
        end_date_time: end ? toApiDateTime(end) : '',
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
  /**
   * `server`: the filter ran on the backend over every matching event.
   * `client`: its terms need the browser evaluator, which only sees the
   * newest {@link REPORT_CHART_CLIENT_WINDOW} events.
   */
  mode: 'server' | 'client';
  /** Events charted, and how many matched; they differ only past the page cap. */
  charted: number;
  matched: number;
}

export const REPORT_CHART_PAGE_SIZE = 1000;
/** 20 pages of 1000: past that the chart says it is partial. */
export const REPORT_CHART_MAX_PAGES = 20;
export const REPORT_CHART_CLIENT_WINDOW = 500;

/** Page through `/filters/preview` until every match is in, or the cap. */
async function fetchAllMatches(ast: FilterAstQuery): Promise<{ items: ZmEvent[]; total: number }> {
  const items: ZmEvent[] = [];
  let total = 0;
  for (let page = 1; page <= REPORT_CHART_MAX_PAGES; page++) {
    const res = await previewFilter(ast, { page, page_size: REPORT_CHART_PAGE_SIZE });
    items.push(...res.items);
    total = res.total;
    if (page >= res.last_page || res.items.length === 0) break;
  }
  return { items, total };
}

/**
 * The legacy chart (`report.js`): every event the report's filter matches,
 * summed per hour of each day. The filter runs on the backend whenever its
 * terms map to the preview AST; otherwise the browser evaluates it against
 * the newest events. Idle (no fetches) when `filterId` is null.
 */
export function useReportChart(filterId: number | null): ReportChartState {
  const filterQ = useQuery({
    queryKey: ['filter', filterId],
    queryFn: () => getFilter(filterId!),
    enabled: filterId != null,
  });

  const parsed = useMemo(
    () => (filterQ.data ? parseFilterQuery(filterQ.data.query_json) : null),
    [filterQ.data],
  );
  const astRes = useMemo(() => (parsed?.ok ? termsToAst(parsed.query) : null), [parsed]);
  const ast = astRes?.ok ? astRes.ast : null;
  const astKey = ast ? JSON.stringify(ast) : null;

  const serverQ = useQuery({
    queryKey: ['reports', 'chart', astKey],
    queryFn: () => fetchAllMatches(ast!),
    enabled: filterId != null && ast != null,
  });

  // Terms the AST cannot carry: evaluate them here over the newest events.
  const clientNeeded = filterId != null && parsed != null && ast == null;
  const eventsQ = useQuery({
    queryKey: ['events', 'reportChart', REPORT_CHART_CLIENT_WINDOW],
    queryFn: () => getEvents({ page: 1, page_size: REPORT_CHART_CLIENT_WINDOW }),
    enabled: clientNeeded,
  });

  const matchedEvents = useMemo<ZmEvent[]>(() => {
    if (ast) return serverQ.data?.items ?? [];
    if (!parsed || !eventsQ.data) return [];
    // An unreadable query_json cannot be evaluated; chart nothing rather than
    // "everything matched".
    return parsed.ok ? evaluateFilter(parsed.query, eventsQ.data.items) : [];
  }, [ast, serverQ.data, parsed, eventsQ.data]);

  const buckets = useMemo(() => bucketEventsByHour(matchedEvents), [matchedEvents]);

  return {
    isLoading: filterQ.isLoading || (ast ? serverQ.isLoading : clientNeeded && eventsQ.isLoading),
    filterError: filterQ.isError || serverQ.isError,
    buckets,
    mode: ast ? 'server' : 'client',
    charted: matchedEvents.length,
    matched: ast ? serverQ.data?.total ?? 0 : matchedEvents.length,
  };
}
