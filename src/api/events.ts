import { apiGet, apiDelete } from './client';
import type { ZmEvent, PaginatedResponse } from '@/types';

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

export async function getEventCounts(): Promise<{ total: number; today: number; week: number; month: number }> {
  return apiGet('/events/counts');
}

export async function getEventCountsByMonitor(): Promise<{ monitor_id: number; count: number }[]> {
  return apiGet('/events/counts/by-monitor');
}

// Event playback URLs
export function getEventVideoUrl(eventId: number): string {
  return `/api/v3/events/${eventId}/playback/video`;
}

export function getEventThumbnailUrl(eventId: number): string {
  return `/api/v3/events/${eventId}/playback/thumbnail`;
}
