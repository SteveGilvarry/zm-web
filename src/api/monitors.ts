import { apiGet, apiPost, apiPatch, apiDelete, getAuthToken, ApiClientError } from './client';
import { API_BASE, wsBase } from '@/api/base';
import type { Monitor, PaginatedResponse, PaginationParams, StartLiveRequest, StartLiveResponse, LiveStats } from '@/types';

/**
 * Enum vocabularies of `Create/UpdateMonitorRequest` (OpenAPI components).
 * Since zm-api #18 (dev box 2026-08-22) GET responses use exactly this
 * spelling too, so a record read from the API can be written straight back
 * — verified live: `GET /monitors/1` returns `Rotate90`, `System`, `Auto`,
 * `WebRtc`. Older builds echoed the raw DB strings (`ROTATE_90`, `system`,
 * `auto`, `WebRTC`) and needed a normalising pass on every read; that pass
 * is gone. Against such a build the enum selects would show their first
 * option instead of the stored value. `contract.test.ts` checks these lists
 * against the OpenAPI snapshot.
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

/**
 * Fold a loosely-spelled enum value onto its request member: `ROTATE_90` →
 * `Rotate90`, `WebRTC` → `WebRtc`. Unknown values pass through untouched.
 * The API no longer needs this; the bundled camera presets do, because
 * their JSON is transcribed from ZoneMinder's own preset files.
 */
export function canonicalEnum(value: string, members: readonly string[]): string {
  const key = foldEnum(value);
  return members.find((m) => foldEnum(m) === key) ?? value;
}

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

// Live streaming — endpoints are protected by Feature::Stream + monitor ACL.
// Both calls go through the authed client so a stale access token gets the
// same 401 → refresh → retry every other request does (a wake-from-sleep used
// to burn every reconnect attempt on 401s).
export async function startLiveStream(monitorId: number, options?: StartLiveRequest): Promise<StartLiveResponse> {
  try {
    return await apiPost<StartLiveRequest, StartLiveResponse>(
      `/live/${monitorId}/start`,
      options || { enable_hls: true },
    );
  } catch (err) {
    // 409 Conflict ("Live stream already exists for monitor N") is not an error —
    // /start is idempotent: the stream is already running and is exactly what we
    // want to connect to. This happens routinely because no client ever sends
    // DELETE /stop (it would kick every other viewer), so the backend session
    // outlives any one tab; and because two monitors can share one RTSP camera.
    // The 409 body carries no signaling URLs, so callers fall back to the
    // conventional paths (getWebRtcWebsocketUrl / getHlsPlaylistUrl).
    if (err instanceof ApiClientError && err.status === 409) {
      return { monitor_id: monitorId, status: 'already_running' };
    }
    throw err;
  }
}

/**
 * Tear down the backend session for a monitor — for EVERY viewer. The stream
 * hooks never call this (closing the socket / destroying hls.js is enough for
 * one client); it exists for an explicit operator action.
 */
export async function stopLiveStream(monitorId: number): Promise<void> {
  try {
    await apiDelete(`/live/${monitorId}/stop`);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) return; // already stopped
    throw err;
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
