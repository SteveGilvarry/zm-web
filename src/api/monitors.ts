import { apiGet, apiPatch, apiDelete, getAuthToken } from './client';
import { API_BASE, wsBase } from '@/api/base';
import type { Monitor, PaginatedResponse, PaginationParams, StartLiveRequest, StartLiveResponse, LiveStats } from '@/types';

/**
 * Enum vocabularies of `Create/UpdateMonitorRequest` (OpenAPI components).
 * GET responses echo the raw DB strings instead — `ROTATE_90`, `system`,
 * `auto`, `WebRTC` — which the request enums reject, so a record read from
 * the API could not be written back (backend ticket BT-02). Every monitor
 * read goes through `normalizeMonitor()` so the rest of the app only ever
 * sees the request casing. `contract.test.ts` checks these lists against
 * the OpenAPI snapshot.
 */
export const MONITOR_ENUMS = {
  type: ['Local', 'Remote', 'File', 'Ffmpeg', 'Libvlc', 'Curl', 'WebSite', 'Vnc'],
  function: ['None', 'Monitor', 'Modect', 'Record', 'Mocord', 'Nodect'],
  capturing: ['None', 'Ondemand', 'Always'],
  decoding: ['None', 'Ondemand', 'KeyFrames', 'KeyFramesOndemand', 'Always'],
  analysing: ['None', 'Always'],
  analysis_source: ['Primary', 'Secondary'],
  analysis_image: ['FullColour', 'YChannel'],
  recording: ['None', 'OnMotion', 'Always'],
  recording_source: ['Primary', 'Secondary', 'Both'],
  orientation: ['Rotate0', 'Rotate90', 'Rotate180', 'Rotate270', 'FlipHori', 'FlipVert'],
  event_close_mode: ['System', 'Time', 'Duration', 'Idle', 'Alarm'],
  default_codec: ['Auto', 'Mp4', 'Mjpeg'],
  output_container: ['Auto', 'Mp4', 'Mkv', 'Webm'],
  rtsp2_web_type: ['Hls', 'Mse', 'WebRtc'],
  importance: ['Normal', 'Less', 'Not'],
} as const satisfies Partial<Record<keyof Monitor, readonly string[]>>;

const foldEnum = (s: string) => s.replace(/_/g, '').toLowerCase();

/** `ROTATE_90` → `Rotate90`, `WebRTC` → `WebRtc`. Unknown values pass through untouched. */
export function canonicalEnum(value: string, members: readonly string[]): string {
  const key = foldEnum(value);
  return members.find((m) => foldEnum(m) === key) ?? value;
}

/** Map a monitor record's enum fields from the response spelling to the request spelling. Idempotent. */
export function normalizeMonitor<T extends Partial<Monitor>>(raw: T): T {
  const out: Record<string, unknown> = { ...raw };
  for (const [key, members] of Object.entries(MONITOR_ENUMS)) {
    const v = out[key];
    if (typeof v === 'string') out[key] = canonicalEnum(v, members);
  }
  return out as T;
}

export async function getMonitors(params?: PaginationParams): Promise<PaginatedResponse<Monitor>> {
  const page = await apiGet<PaginatedResponse<Monitor>>('/monitors', params);
  return { ...page, items: page.items.map(normalizeMonitor) };
}

export async function getMonitor(id: number): Promise<Monitor> {
  return normalizeMonitor(await apiGet<Monitor>(`/monitors/${id}`));
}

export async function updateMonitor(id: number, data: Partial<Monitor>): Promise<Monitor> {
  return normalizeMonitor(await apiPatch<Partial<Monitor>, Monitor>(`/monitors/${id}`, data));
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
  return normalizeMonitor(await apiPatch<AlarmControlRequest, Monitor>(`/monitors/${id}/alarm`, body));
}

// Live streaming — endpoints are protected by Feature::Stream + monitor ACL,
// so a Bearer token is required (header is accepted; query fallback also works).
export async function startLiveStream(monitorId: number, options?: StartLiveRequest): Promise<StartLiveResponse> {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE}/live/${monitorId}/start`, {
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
  const response = await fetch(`${API_BASE}/live/${monitorId}/stop`, {
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
  const base = `${API_BASE}/monitors/${monitorId}/snapshot`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

// Helper URLs for live streaming.
// HLS playlist/segments are auth-protected. hls.js fetches them via XHR, so the
// token is attached as an Authorization header in useHlsStream's xhrSetup — this
// bare URL is correct for that path. Pass withToken=true only for the Safari
// native-HLS fallback, where <video> src cannot carry headers.
export function getHlsPlaylistUrl(monitorId: number, withToken = false): string {
  const url = `${API_BASE}/live/${monitorId}/hls/master.m3u8`;
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
 * otherwise we fall back to the conventional `${API_BASE}/live/{id}/webrtc/ws`. The
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
    base = `${wsBase()}/live/${monitorId}/webrtc/ws`;
  }

  const token = getAuthToken();
  if (!token) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}token=${token}`;
}
