import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { listReports, createReport, deleteReport, type Report } from '@/api/reports';
import { listFilters } from '@/api/filters';
import { toLocalDatetime } from './datetime';

export interface ReportsListPageState {
  isAuthenticated: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  reports: Report[];
  filters: Array<{ id: number; name: string }>;
  filterLookup: Map<number, string>;
  showCreate: boolean;
  toggleCreate: () => void;
  /** Called by the create form once the backend accepts the new report. */
  onCreated: () => void;
  remove: (id: number) => void;
}

/** Saved-report table + create toggle for the Reports list page. */
export function useReportsListPage(): ReportsListPageState {
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();
  const toast = useToast();

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
    onError: toast.apiError,
  });

  return {
    isAuthenticated,
    isLoading: reportsQ.isLoading,
    isError: reportsQ.isError,
    error: (reportsQ.error as Error | null) ?? null,
    refetch: () => { reportsQ.refetch(); },
    reports,
    filters,
    filterLookup,
    showCreate,
    toggleCreate: () => setShowCreate((v) => !v),
    onCreated: () => {
      qc.invalidateQueries({ queryKey: ['reports'] });
      setShowCreate(false);
    },
    remove: (id: number) => deleteMutation.mutate(id),
  };
}

export interface CreateReportFormState {
  name: string;
  setName: (v: string) => void;
  start: string;
  setStart: (v: string) => void;
  end: string;
  setEnd: (v: string) => void;
  filterId: number | '';
  setFilterId: (v: number | '') => void;
  interval: number | '';
  setInterval: (v: number | '') => void;
  submit: (e: FormEvent) => void;
  pending: boolean;
}

/** Draft state + POST for the "New report" form. Defaults to the last 7 days. */
export function useCreateReportForm(onCreated: () => void): CreateReportFormState {
  const toast = useToast();
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
    onError: toast.apiError,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return {
    name, setName,
    start, setStart,
    end, setEnd,
    filterId, setFilterId,
    interval, setInterval,
    submit,
    pending: create.isPending,
  };
}
