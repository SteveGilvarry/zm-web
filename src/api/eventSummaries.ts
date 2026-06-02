import { apiGet } from './client';
import type { PaginatedResponse } from '@/types';

export interface EventSummary {
  monitor_id: number;
  total_events: number;
  total_event_disk_space: number;
  hour_events: number;
  hour_event_disk_space: number;
  day_events: number;
  day_event_disk_space: number;
  week_events: number;
  week_event_disk_space: number;
  month_events: number;
  month_event_disk_space: number;
  archived_events: number;
  archived_event_disk_space: number;
}

export async function listEventSummaries(params?: {
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<EventSummary>> {
  return apiGet<PaginatedResponse<EventSummary>>(
    '/event-summaries',
    params as Record<string, string | number | undefined>,
  );
}

export async function getEventSummary(monitorId: number): Promise<EventSummary> {
  return apiGet<EventSummary>(`/event-summaries/${monitorId}`);
}
