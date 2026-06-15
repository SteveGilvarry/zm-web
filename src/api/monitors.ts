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

/**
 * Trigger / cancel a forced alarm on the monitor — the legacy "Force Alarm"
 * button. Backed by `PATCH /api/v3/monitors/{id}/alarm` with an action of
 * `on` (trigger), `off`/`cancel`, or `status`.
 */
export interface AlarmControlRequest {
  action: 'on' | 'off' | 'cancel' | 'status';
  cause?: string | null;
  score?: number | null;
  text?: string | null;
}

export async function controlMonitorAlarm(id: number, body: AlarmControlRequest): Promise<Monitor> {
  return apiPatch<AlarmControlRequest, Monitor>(`/monitors/${id}/alarm`, body);
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
  // 409 Conflict ("Live stream already exists for monitor N") is not an error —
  // /start is idempotent: the stream is already running and is exactly what we
  // want to connect to. This happens routinely because stopping a stream closes
  // the signaling socket WITHOUT a DELETE /stop (so other viewers aren't kicked),
  // leaving the backend session alive; and because two monitors can share one
  // RTSP camera. Return success so callers proceed to connect. The 409 body
  // carries no signaling URLs, so callers fall back to the conventional paths
  // (getWebRtcWebsocketUrl / getHlsPlaylistUrl).
  if (response.status === 409) {
    return { monitor_id: monitorId, status: 'already_running' };
  }
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

/**
 * Build the WebRTC signaling WebSocket URL for a monitor.
 *
 * The WS route is RBAC-guarded (Stream:View) and browsers cannot set headers on
 * `new WebSocket()`, so the JWT is passed via `?token=` (raw — the backend ACL
 * guard does not percent-decode it).
 *
 * `signalingPath` is the `webrtc_signaling` value returned by `POST /start`. When
 * present it is preferred (the backend is the source of truth for the path);
 * otherwise we fall back to the conventional `/api/v3/live/{id}/webrtc/ws`. The
 * value may be a relative path, an absolute path, or a full http(s)/ws(s) URL —
 * all are normalised to a ws(s) URL on the current origin.
 */
export function getWebRtcWebsocketUrl(monitorId: number, signalingPath?: string): string {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  let base: string;
  if (signalingPath) {
    if (/^wss?:\/\//i.test(signalingPath)) {
      base = signalingPath;
    } else if (/^https?:\/\//i.test(signalingPath)) {
      // Full http(s) URL — swap the scheme to ws(s), keep host + path.
      base = signalingPath.replace(/^http/i, 'ws');
    } else {
      const path = signalingPath.startsWith('/') ? signalingPath : `/${signalingPath}`;
      base = `${wsProtocol}//${window.location.host}${path}`;
    }
  } else {
    base = `${wsProtocol}//${window.location.host}/api/v3/live/${monitorId}/webrtc/ws`;
  }

  const token = getAuthToken();
  if (!token) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}token=${token}`;
}
