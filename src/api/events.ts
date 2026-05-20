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
  start_date?: string;
  end_date?: string;
  cause?: string;
  archived?: boolean;
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

export async function getEventCountsByMonitor(hours: number = 24): Promise<EventCountByMonitor[]> {
  return apiGet(`/events/counts-by-monitor/${hours}`);
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
