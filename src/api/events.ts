import { apiGet, apiDelete, apiPatch } from './client';
import { API_BASE } from '@/api/base';
import type { ZmEvent, PaginatedResponse } from '@/types';

export interface EventUpdatePayload {
  name?: string | null;
  cause?: string | null;
  notes?: string | null;
  archived?: boolean | null;
  locked?: boolean | null;
}

export async function updateEvent(id: number, payload: EventUpdatePayload): Promise<ZmEvent> {
  return apiPatch<EventUpdatePayload, ZmEvent>(`/events/${id}`, payload);
}

/** `EventSortField` in the OpenAPI spec — anything else answers 400. */
export const EVENT_SORT_FIELDS = [
  'start_time', 'end_time', 'alarm_frames', 'max_score',
  'avg_score', 'tot_score', 'length', 'id',
  // zm-api#20 widened the enum; a backend older than that answers 400 for
  // these five.
  'name', 'cause', 'monitor_id', 'notes', 'frames',
  // zm-api#136 added the last three legacy columns (2026-10). Tags is the
  // only legacy sort still without a backend field.
  'archived', 'emailed', 'disk_space',
] as const;
export type EventSortField = (typeof EVENT_SORT_FIELDS)[number];
export type SortDirection = 'asc' | 'desc';

export function isEventSortField(v: unknown): v is EventSortField {
  return typeof v === 'string' && (EVENT_SORT_FIELDS as readonly string[]).includes(v);
}

/**
 * Map a legacy `ZM_WEB_EVENT_SORT_FIELD` value (the PHP UI's column names)
 * onto the backend's sort enum. The only legacy column left without a
 * backend equivalent is `Tags`; it falls back to `start_time`, which is the
 * legacy default anyway.
 */
export function legacySortFieldToApi(legacy: string): EventSortField {
  switch (legacy.trim()) {
    case 'Id': return 'id';
    case 'StartDateTime': case 'StartTime': return 'start_time';
    case 'EndDateTime': case 'EndTime': return 'end_time';
    case 'Length': return 'length';
    case 'AlarmFrames': return 'alarm_frames';
    case 'TotScore': return 'tot_score';
    case 'AvgScore': return 'avg_score';
    case 'MaxScore': return 'max_score';
    case 'Name': return 'name';
    case 'Cause': return 'cause';
    case 'Notes': return 'notes';
    case 'Frames': return 'frames';
    case 'Monitor': case 'MonitorId': case 'MonitorName': return 'monitor_id';
    case 'Archived': return 'archived';
    case 'Emailed': return 'emailed';
    case 'DiskSpace': return 'disk_space';
    default: return isEventSortField(legacy) ? legacy : 'start_time';
  }
}

export interface EventQueryParams {
  page?: number;
  page_size?: number;
  monitor_id?: number;
  /** ISO timestamp; events with start_date_time >= this. */
  start_time?: string;
  /**
   * ISO timestamp; events with **end_date_time** <= this (not start — see
   * zm-api `repo/events.rs`). An event still running at this instant is
   * excluded.
   */
  end_time?: string;
  archived?: boolean;
  /** Only events stored on this storage area (legacy's `StorageId` term). */
  storage_id?: number;
  alarm_frames_min?: number;
  /** Case-insensitive substring match on `Events.Cause` (zm-api#20). */
  cause?: string;
  /** Case-insensitive substring match on `Events.Name` (zm-api#20). */
  name?: string;
  /** Case-insensitive substring match on `Events.Notes` (zm-api#20). */
  notes?: string;
  /**
   * Comma-separated tag ids. With `tag_op` `in` (the default) an event
   * carrying **any** of them is kept; with `not_in`, events carrying none of
   * them. `none` keeps untagged events and `any` keeps events with at least
   * one tag — legacy's `0` and `-1` (zm-api#136).
   */
  tag_id?: string;
  tag_op?: TagOp;
  /**
   * Also return `total_length_seconds` and `total_disk_space` summed over the
   * whole result rather than the page. Off by default: it costs the backend a
   * second aggregate query.
   */
  totals?: boolean;
  /**
   * Free-text search over id, monitor, storage, name, cause, start/end time,
   * length, frames, scores, archived, emailed, notes and disk space; any may
   * match (legacy's `?search=`, the events page filter box).
   */
  q?: string;
  sort?: EventSortField;
  direction?: SortDirection;
}

/** `TagOp` in the OpenAPI spec — how `tag_id` is applied. */
export type TagOp = 'in' | 'not_in';

/** Legacy's special tag ids: `0` = No Tag, `-1` = Any Tag. */
export const TAG_NONE = 'none';
export const TAG_ANY = 'any';

/**
 * `PaginatedEventsResponse`: the page plus, when `totals` was requested, the
 * sums legacy prints in the events footer (`Length`, `DiskSpace`).
 */
export interface EventsPage extends PaginatedResponse<ZmEvent> {
  total_disk_space?: number | null;
  total_length_seconds?: number | null;
}

export async function getEvents(params?: EventQueryParams): Promise<EventsPage> {
  return apiGet<EventsPage>('/events', params as Record<string, string | number | undefined>);
}

export async function getEvent(id: number): Promise<ZmEvent> {
  return apiGet<ZmEvent>(`/events/${id}`);
}

export async function deleteEvent(id: number): Promise<void> {
  return apiDelete(`/events/${id}`);
}

export interface HourlyCount {
  count: number;
  date: string;
}

export interface EventCountsResponse {
  counts: HourlyCount[];
  hours: number;
}

export interface EventCounts {
  total: number;
  hourly: HourlyCount[];
}

export async function getEventCounts(hours: number = 24): Promise<EventCounts> {
  const response = await apiGet<EventCountsResponse>(`/events/counts/${hours}`);
  const total = response.counts.reduce((sum, item) => sum + item.count, 0);
  return {
    total,
    hourly: response.counts,
  };
}

export interface EventCountByMonitor {
  monitor_id: number;
  count: number;
}

interface EventCountsByMonitorResponse {
  counts: EventCountByMonitor[];
  hours: number;
}

export async function getEventCountsByMonitor(hours: number = 24): Promise<EventCountByMonitor[]> {
  // Backend wraps the array in { counts, hours } — unwrap so callers can
  // iterate directly.
  const response = await apiGet<EventCountsByMonitorResponse>(
    `/events/counts-by-monitor/${hours}`,
  );
  return response?.counts ?? [];
}

/**
 * Playback metadata for an event. Probe this first, then branch playback on
 * `recommended_mode`: "direct" → progressive MP4 (`/stream/video.mp4`, Range
 * supported, plays everywhere); "hls" → HLS playlist (HEVC, Safari /
 * hardware-Chrome only).
 */
export interface EventVideoInfo {
  event_id: number;
  /** "H264" | "H265" | "Unknown" */
  video_codec: string;
  width: number;
  height: number;
  duration_seconds: number;
  file_size: number;
  /** True when the codec plays in any browser <video> (H.264). */
  playable_direct: boolean;
  /** "direct" | "hls" */
  recommended_mode: string;
}

export async function getEventInfo(id: number): Promise<EventVideoInfo> {
  return apiGet<EventVideoInfo>(`/events/${id}/info`);
}

// Event playback URLs - token param for media elements that can't send headers
export function getEventVideoUrl(eventId: number, token?: string): string {
  const base = `${API_BASE}/events/${eventId}/video`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export function getEventThumbnailUrl(eventId: number, token?: string): string {
  const base = `${API_BASE}/events/${eventId}/thumbnail`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export function getEventStreamUrl(eventId: number, token?: string): string {
  const base = `${API_BASE}/events/${eventId}/stream/video.mp4`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export function getEventPlaylistUrl(eventId: number, token?: string): string {
  const base = `${API_BASE}/events/${eventId}/stream/playlist.m3u8`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}
