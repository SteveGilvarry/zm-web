import { getServerStats, statNumber, type ServerStat } from '@/api/system';

/** `server_id` 0 / null both mean "this host" on a single-node install. */
export function statServerKey(stat: Pick<ServerStat, 'server_id'>): number {
  return stat.server_id ?? 0;
}

/** Newest sample per server, by `time_stamp` (then id, if stamps tie). */
export function latestPerServer(items: readonly ServerStat[]): Map<number, ServerStat> {
  const out = new Map<number, ServerStat>();
  for (const s of items) {
    const key = statServerKey(s);
    const prev = out.get(key);
    if (!prev) { out.set(key, s); continue; }
    const a = Date.parse(prev.time_stamp);
    const b = Date.parse(s.time_stamp);
    const newer = Number.isFinite(a) && Number.isFinite(b) ? b > a || (b === a && s.id > prev.id) : s.id > prev.id;
    if (newer) out.set(key, s);
  }
  return out;
}

/**
 * `/server-stats` pages oldest-first with no sort parameter, so the newest
 * rows sit on the last page: ask for the total, then fetch that page.
 * Two requests, but the table only holds one row per server.
 */
export async function fetchLatestServerStats(pageSize = 200): Promise<Map<number, ServerStat>> {
  const head = await getServerStats({ page: 1, page_size: 1 });
  if (head.total === 0) return new Map();
  const lastPage = Math.max(1, Math.ceil(head.total / pageSize));
  const tail = await getServerStats({ page: lastPage, page_size: pageSize });
  return latestPerServer(tail.items);
}

export interface ServerLoadSummary {
  cpuLoad: number | null;
  cpuPercent: number | null;
  /** Used memory as a percentage of total. */
  memPercent: number | null;
  /** Free memory / swap as a percentage of total (legacy colours these). */
  memFreePercent: number | null;
  swapFreePercent: number | null;
  sampledAt: string;
}

function freePercent(total: number | null | undefined, free: number | null | undefined): number | null {
  return total && total > 0 && free != null ? (free / total) * 100 : null;
}

export function summarizeStat(stat: ServerStat): ServerLoadSummary {
  const memFreePercent = freePercent(stat.total_mem, stat.free_mem);
  return {
    cpuLoad: statNumber(stat.cpu_load),
    cpuPercent: statNumber(stat.cpu_usage_percent),
    memPercent: memFreePercent == null ? null : 100 - memFreePercent,
    memFreePercent,
    swapFreePercent: freePercent(stat.total_swap, stat.free_swap),
    sampledAt: stat.time_stamp,
  };
}

/**
 * Legacy `server.php` thresholds: CpuLoad over 5 and free memory or swap
 * under 10% are painted red (`class="error"`); between those and the
 * comfortable range, amber.
 */
export const CPU_LOAD_WARN = 2.5;
export const CPU_LOAD_ERROR = 5;
export const FREE_PERCENT_WARN = 20;
export const FREE_PERCENT_ERROR = 10;

export type LoadTone = 'ok' | 'warn' | 'error' | 'none';

export function cpuLoadTone(load: number | null): LoadTone {
  if (load == null) return 'none';
  if (load > CPU_LOAD_ERROR) return 'error';
  if (load > CPU_LOAD_WARN) return 'warn';
  return 'ok';
}

export function freeTone(freePct: number | null): LoadTone {
  if (freePct == null) return 'none';
  if (freePct < FREE_PERCENT_ERROR) return 'error';
  if (freePct < FREE_PERCENT_WARN) return 'warn';
  return 'ok';
}

/** `Servers.Status` (`Unknown` / `Running` / `NotRunning`) plus older spellings. */
export function serverStatusTone(status: string): 'ok' | 'down' | 'unknown' {
  const s = status.replace(/[\s_-]/g, '').toLowerCase();
  if (s === 'running' || s === 'online') return 'ok';
  if (s === 'notrunning' || s === 'offline' || s === 'down') return 'down';
  return 'unknown';
}
