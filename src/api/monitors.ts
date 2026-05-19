import { apiGet, apiPatch, apiDelete, getAuthToken } from './client';
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

// Live streaming — endpoints are protected by Feature::Stream + monitor ACL,
// so a Bearer token is required (header is accepted; query fallback also works).
export async function startLiveStream(monitorId: number, options?: StartLiveRequest): Promise<StartLiveResponse> {
  const token = getAuthToken();
  const response = await fetch(`/api/v3/live/${monitorId}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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
  const token = getAuthToken();
  const response = await fetch(`/api/v3/live/${monitorId}/stop`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
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

// Snapshot — returns JPEG, requires auth token as query param for <img> use
export function getMonitorSnapshotUrl(monitorId: number, token?: string): string {
  const base = `/api/v3/monitors/${monitorId}/snapshot`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

// Helper URLs for live streaming.
// HLS playlist/segments are auth-protected. hls.js fetches them via XHR, so the
// token is attached as an Authorization header in useHlsStream's xhrSetup — this
// bare URL is correct for that path. Pass withToken=true only for the Safari
// native-HLS fallback, where <video> src cannot carry headers.
export function getHlsPlaylistUrl(monitorId: number, withToken = false): string {
  const url = `/api/v3/live/${monitorId}/hls/master.m3u8`;
  if (!withToken) return url;
  const token = getAuthToken();
  // Token is base64url-safe — pass raw, the backend's monitor ACL guard does not
  // percent-decode the query param.
  return token ? `${url}?token=${token}` : url;
}

export function getWebRtcWebsocketUrl(monitorId: number): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${protocol}//${window.location.host}/api/v3/live/${monitorId}/webrtc/ws`;
  // Browser WebSocket cannot send headers — the JWT must go via ?token=.
  const token = getAuthToken();
  return token ? `${base}?token=${token}` : base;
}
