import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMonitorStatuses, type MonitorStatusRecord } from '@/api/monitorStatus';
import { useAuthStore } from '@/stores/auth';

/** Legacy status poll is 1 s per cell; one fleet-wide call every 5 s is plenty. */
export const MONITOR_STATUS_POLL_MS = 5_000;

/** Parsed, display-ready runtime state for one monitor. */
export interface MonitorRuntime {
  monitorId: number;
  /** `Unknown | NotRunning | Running | Connected | Signal` (raw wire value). */
  status: string;
  captureFps: number;
  analysisFps: number;
  /** Bytes per second. */
  bandwidth: number;
  updatedOn: string;
}

export type RuntimeTone = 'ok' | 'warn' | 'down' | 'unknown';

/**
 * Colour bucket for a runtime status. Legacy console paints Connected/Signal
 * green ("capturing"), Running amber (process up, no frames yet) and
 * NotRunning red; anything else, including no row at all, is grey.
 */
export function runtimeTone(status: string | undefined): RuntimeTone {
  switch (status) {
    case 'Connected':
    case 'Signal':
      return 'ok';
    case 'Running':
      return 'warn';
    case 'NotRunning':
      return 'down';
    default:
      return 'unknown';
  }
}

export function parseRuntime(row: MonitorStatusRecord): MonitorRuntime {
  const num = (s: string | number | null | undefined) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    monitorId: row.monitor_id,
    status: row.status,
    captureFps: num(row.capture_fps),
    analysisFps: num(row.analysis_fps),
    bandwidth: num(row.capture_bandwidth),
    updatedOn: row.updated_on,
  };
}

/** `10.9 fps` — one decimal, locale-aware digits. */
export function formatFps(fps: number, locale?: string): string {
  return `${fps.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} fps`;
}

/** `1.4 MB/s` / `6.2 KB/s` / `0 B/s`. */
export function formatBandwidth(bytesPerSec: number, locale?: string): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let v = bytesPerSec;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  const digits = i === 0 ? 0 : 1;
  return `${v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${units[i]}`;
}

export interface MonitorStatusesResult {
  byId: Record<number, MonitorRuntime>;
  list: MonitorRuntime[];
  isLoading: boolean;
  isError: boolean;
}

const EMPTY: Record<number, MonitorRuntime> = {};

/**
 * Fleet-wide runtime status, polled every 5 s and shared through the query
 * cache, so the console lens, the Watch overlay, montage captions and the
 * monitors list all read one request. `byId` is a plain record (not a Map)
 * so the React Compiler can track it by value.
 */
export function useMonitorStatuses(enabled = true): MonitorStatusesResult {
  const { isAuthenticated } = useAuthStore();
  const q = useQuery({
    queryKey: ['monitorStatuses'],
    queryFn: () => getMonitorStatuses({ page: 1, page_size: 1000 }),
    enabled: isAuthenticated && enabled,
    refetchInterval: MONITOR_STATUS_POLL_MS,
    staleTime: MONITOR_STATUS_POLL_MS,
  });
  const items = q.data?.items;
  const list = useMemo(() => (items ?? []).map(parseRuntime), [items]);
  const byId = useMemo(() => {
    if (list.length === 0) return EMPTY;
    const out: Record<number, MonitorRuntime> = {};
    for (const r of list) out[r.monitorId] = r;
    return out;
  }, [list]);
  return { byId, list, isLoading: q.isLoading, isError: q.isError };
}

/** One monitor's runtime row from the shared poll; undefined until known. */
export function useMonitorStatus(monitorId: number, enabled = true): MonitorRuntime | undefined {
  const { byId } = useMonitorStatuses(enabled);
  return byId[monitorId];
}

export interface RuntimeTotals {
  bandwidth: number;
  captureFps: number;
  analysisFps: number;
  /** Count of monitors per tone — feeds the legacy "Capturing 75% / Not Running 25%" pills. */
  byTone: Record<RuntimeTone, number>;
}

/** Aggregate the runtime rows for a set of monitors (monitors with no row count as `unknown`). */
export function summarizeRuntime(
  byId: Record<number, MonitorRuntime>,
  monitorIds: number[],
): RuntimeTotals {
  const totals: RuntimeTotals = {
    bandwidth: 0, captureFps: 0, analysisFps: 0,
    byTone: { ok: 0, warn: 0, down: 0, unknown: 0 },
  };
  for (const id of monitorIds) {
    const r = byId[id];
    totals.byTone[runtimeTone(r?.status)] += 1;
    if (!r) continue;
    totals.bandwidth += r.bandwidth;
    totals.captureFps += r.captureFps;
    totals.analysisFps += r.analysisFps;
  }
  return totals;
}
