import { apiGet, apiDelete, apiPatch } from './client';
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

export interface EventQueryParams {
  page?: number;
  page_size?: number;
  monitor_id?: number;
  /** ISO timestamp; events with start_date_time >= this. */
  start_time?: string;
  /** ISO timestamp; events with start_date_time <= this. */
  end_time?: string;
  cause?: string;
  archived?: boolean;
  alarm_frames_min?: number;
  sort?: 'id' | 'start_date_time' | 'max_score' | 'frames';
  direction?: 'asc' | 'desc';
}

export async function getEvents(params?: EventQueryParams): Promise<PaginatedResponse<ZmEvent>> {
  return apiGet<PaginatedResponse<ZmEvent>>('/events', params as Record<string, string | number | undefined>);
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
  const base = `/api/v3/events/${eventId}/video`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export function getEventThumbnailUrl(eventId: number, token?: string): string {
  const base = `/api/v3/events/${eventId}/thumbnail`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export function getEventStreamUrl(eventId: number, token?: string): string {
  const base = `/api/v3/events/${eventId}/stream/video.mp4`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export function getEventPlaylistUrl(eventId: number, token?: string): string {
  const base = `/api/v3/events/${eventId}/stream/playlist.m3u8`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}
