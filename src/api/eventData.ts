import { apiGet } from './client';
import type { PaginatedResponse } from '@/types';

/**
 * One row of ZoneMinder's `Event_Data` table (`/api/v3/event-data`): free-form
 * text a detector or trigger attached to a frame of an event (object labels,
 * licence plates, zmtrigger payloads).
 */
export interface EventDataRow {
  id: number;
  event_id?: number | null;
  monitor_id?: number | null;
  frame_id?: number | null;
  timestamp?: string | null;
  data?: string | null;
}

export async function listEventData(params: {
  event_id: number;
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<EventDataRow>> {
  return apiGet<PaginatedResponse<EventDataRow>>(
    '/event-data',
    params as Record<string, string | number | undefined>,
  );
}

export async function getEventData(id: number): Promise<EventDataRow> {
  return apiGet<EventDataRow>(`/event-data/${id}`);
}
