import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { Monitor, PaginatedResponse, PaginationParams, StartLiveRequest, StartLiveResponse, LiveStats } from '@/types';

export async function getMonitors(params?: PaginationParams): Promise<PaginatedResponse<Monitor>> {
  return apiGet<PaginatedResponse<Monitor>>('/monitors', params);
}

export async function getMonitor(id: number): Promise<Monitor> {
  return apiGet<Monitor>(`/monitors/${id}`);
}

export async function updateMonitor(id: number, data: Partial<Monitor>): Promise<Monitor> {
  return apiPatch<Partial<Monitor>, Monitor>(`/monitors/${id}`, data);
}

export async function deleteMonitor(id: number): Promise<void> {
  return apiDelete(`/monitors/${id}`);
}

// Live streaming
export async function startLiveStream(monitorId: number, options?: StartLiveRequest): Promise<StartLiveResponse> {
  return apiPost<StartLiveRequest, StartLiveResponse>(`/live/${monitorId}/start`, options || { enable_hls: true });
}

export async function stopLiveStream(monitorId: number): Promise<void> {
  return apiDelete(`/live/${monitorId}/stop`);
}

export async function getLiveStats(monitorId: number): Promise<LiveStats> {
  return apiGet<LiveStats>(`/live/${monitorId}/stats`);
}

export async function getLiveSessions(): Promise<number[]> {
  return apiGet<number[]>('/live/sessions');
}

// Helper to build HLS URL
export function getHlsPlaylistUrl(monitorId: number): string {
  return `/api/v3/live/${monitorId}/hls/live.m3u8`;
}
