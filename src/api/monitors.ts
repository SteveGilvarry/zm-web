import { apiGet, apiPatch, apiDelete } from './client';
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

// Live streaming — no auth required on start/stop endpoints
export async function startLiveStream(monitorId: number, options?: StartLiveRequest): Promise<StartLiveResponse> {
  const response = await fetch(`/api/v3/live/${monitorId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || { enable_hls: true }),
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      message = body.error_message || body.message || body.error || message;
    } catch {
      // Response wasn't JSON
    }
    throw new Error(message);
  }
  return response.json();
}

export async function stopLiveStream(monitorId: number): Promise<void> {
  const response = await fetch(`/api/v3/live/${monitorId}/stop`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
}

export async function getLiveStats(monitorId: number): Promise<LiveStats> {
  return apiGet<LiveStats>(`/live/${monitorId}/stats`);
}

export async function getLiveSessions(): Promise<number[]> {
  return apiGet<number[]>('/live/sessions');
}

// Helper URLs for live streaming
export function getHlsPlaylistUrl(monitorId: number): string {
  return `/api/v3/live/${monitorId}/hls/master.m3u8`;
}

export function getWebRtcWebsocketUrl(monitorId: number): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/v3/live/${monitorId}/webrtc/ws`;
}
