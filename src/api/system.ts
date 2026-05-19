import { apiGet, apiPost } from './client';
import type { DaemonStatus } from '@/types';

export interface SystemStatusResponse {
  version: string;
  api_version: string;
}

export interface DaemonListResponse {
  daemons: DaemonStatus[];
}

export async function getVersion(): Promise<SystemStatusResponse> {
  return apiGet<SystemStatusResponse>('/version');
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

// Server stats
export interface ServerStats {
  id: number;
  server_id?: number;
  timestamp: string;
  cpu_user?: number;
  cpu_nice?: number;
  cpu_sys?: number;
  cpu_idle?: number;
  cpu_iowait?: number;
  mem_total?: number;
  mem_used?: number;
  mem_buffers?: number;
  swap_total?: number;
  swap_used?: number;
}

export async function getServerStats(): Promise<ServerStats[]> {
  return apiGet('/server-stats');
}

export async function getHealthCheck(): Promise<{ status: string }> {
  return apiGet('/server/health_check');
}

export async function systemLogRotate(): Promise<void> {
  return apiPost('/system/log_rotate');
}
