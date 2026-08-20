import { apiGet, apiPost } from './client';
import type { DaemonStatus, PaginatedResponse } from '@/types';

export interface VersionResponse {
  version: string;
  api_version: string;
  db_version: string;
}

export interface DaemonListResponse {
  daemons: DaemonStatus[];
}

export async function getVersion(): Promise<VersionResponse> {
  return apiGet<VersionResponse>('/host/getVersion');
}

export async function getDaemons(): Promise<DaemonListResponse> {
  return apiGet<DaemonListResponse>('/daemons');
}

export async function getDaemon(name: string): Promise<DaemonStatus> {
  return apiGet<DaemonStatus>(`/daemons/${name}`);
}

export async function startDaemon(name: string): Promise<void> {
  return apiPost(`/daemons/${name}/start`);
}

export async function stopDaemon(name: string): Promise<void> {
  return apiPost(`/daemons/${name}/stop`);
}

export async function restartDaemon(name: string): Promise<void> {
  return apiPost(`/daemons/${name}/restart`);
}

export interface SystemStats {
  cpu_load: number;
  cpu_usage_percent: number;
  total_mem: number;
  free_mem: number;
  total_swap: number;
  free_swap: number;
  total_disk: number;
  used_disk: number;
  free_disk: number;
  disk_usage_percent: number;
}

export interface SystemStatusResponse {
  running: boolean;
  daemons: string[];
  stats?: SystemStats;
}

export async function getSystemStatus(): Promise<SystemStatusResponse> {
  return apiGet('/system/status');
}

export async function systemStartup(): Promise<void> {
  return apiPost('/system/startup');
}

export async function systemShutdown(): Promise<void> {
  return apiPost('/system/shutdown');
}

export async function systemRestart(): Promise<void> {
  return apiPost('/system/restart');
}

// Server stats — one row per sample of `zmstats.pl`, per server (`server_id`
// 0 / null on a single-node install). Percentages and load are strings in
// `ServerStatResponse`; use `statNumber()` to read them.
export interface ServerStat {
  id: number;
  server_id?: number | null;
  time_stamp: string;
  cpu_load?: string | null;
  cpu_user_percent?: string | null;
  cpu_nice_percent?: string | null;
  cpu_system_percent?: string | null;
  cpu_idle_percent?: string | null;
  cpu_usage_percent?: string | null;
  total_mem?: number | null;
  free_mem?: number | null;
  total_swap?: number | null;
  free_swap?: number | null;
}

/** Rows come back oldest first; the newest sample is on the last page. */
export async function getServerStats(
  params?: { page?: number; page_size?: number },
): Promise<PaginatedResponse<ServerStat>> {
  return apiGet<PaginatedResponse<ServerStat>>('/server-stats', params);
}

/** `"40.2"` → 40.2; null/garbage → null. */
export function statNumber(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function getHealthCheck(): Promise<{ status: string }> {
  return apiGet('/server/health_check');
}

export async function systemLogRotate(): Promise<void> {
  return apiPost('/system/logrot');
}
