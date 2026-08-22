import type { DaemonStatus } from '@/types';
import type { ServerStat, SystemStats, VersionResponse } from '@/api/system';

/** A managed daemon (`DaemonStatusResponse`). */
export function makeDaemon(overrides: Partial<DaemonStatus> = {}): DaemonStatus {
  return {
    id: 'zmc_m1',
    name: 'zmc -m 1',
    state: 'running',
    pid: 4242,
    uptime_seconds: 3600,
    restart_count: 0,
    monitor_id: 1,
    ...overrides,
  };
}

export function makeSystemStats(overrides: Partial<SystemStats> = {}): SystemStats {
  return {
    cpu_load: 1.2,
    cpu_usage_percent: 15.3,
    total_mem: 16_000_000_000,
    free_mem: 8_000_000_000,
    total_swap: 4_000_000_000,
    free_swap: 4_000_000_000,
    total_disk: 1_000_000_000_000,
    used_disk: 500_000_000_000,
    free_disk: 500_000_000_000,
    disk_usage_percent: 50,
    ...overrides,
  };
}

/**
 * `GET /api/v3/system/status`.
 *
 * Note the shape: `daemons` is an array of `DaemonStatusResponse` objects in
 * the OpenAPI snapshot, while `SystemStatusResponse` in `src/api/system.ts`
 * declares `string[]`. Nothing reads that field (the console and Options page
 * both use `GET /daemons`), so the fixture follows the spec, not the stale
 * local type.
 */
export interface SystemStatusFixture {
  running: boolean;
  daemons: DaemonStatus[];
  stats?: SystemStats;
}

export function makeSystemStatus(
  overrides: Partial<SystemStatusFixture> = {},
): SystemStatusFixture {
  return {
    running: true,
    daemons: [makeDaemon()],
    stats: makeSystemStats(),
    ...overrides,
  };
}

export function makeVersion(overrides: Partial<VersionResponse> = {}): VersionResponse {
  return {
    version: '1.37.64',
    api_version: '3.0.0',
    db_version: '1.37.64',
    ...overrides,
  };
}

/** A `zmstats.pl` sample (`GET /api/v3/server-stats`); percentages are strings. */
export function makeServerStat(overrides: Partial<ServerStat> = {}): ServerStat {
  return {
    id: 1,
    server_id: null,
    time_stamp: '2026-08-21T09:00:00Z',
    cpu_load: '1.20',
    cpu_user_percent: '10.00',
    cpu_nice_percent: '0.00',
    cpu_system_percent: '5.00',
    cpu_idle_percent: '85.00',
    cpu_usage_percent: '15.00',
    total_mem: 16_000_000_000,
    free_mem: 8_000_000_000,
    total_swap: 4_000_000_000,
    free_swap: 4_000_000_000,
    ...overrides,
  };
}
