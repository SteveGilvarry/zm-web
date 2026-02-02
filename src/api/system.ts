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

export async function getSystemStatus(): Promise<{
  status: string;
  run_state?: string;
  cpu_load?: number[];
}> {
  return apiGet('/daemons/system/status');
}

export async function systemStartup(): Promise<void> {
  return apiPost('/daemons/system/startup');
}

export async function systemShutdown(): Promise<void> {
  return apiPost('/daemons/system/shutdown');
}

export async function systemRestart(): Promise<void> {
  return apiPost('/daemons/system/restart');
}
