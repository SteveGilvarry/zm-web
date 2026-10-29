import { apiGet } from './client';
import type { PaginatedResponse } from '@/types';

/**
 * One row of ZoneMinder's `Stats` table — the per-zone motion analysis of
 * one frame. Legacy shows them on `?view=stats&eid=` and behind the "+" on
 * a frames row. Pixel counts are absolute; legacy turns them into
 * percentages of the zone's area.
 */
export interface Stat {
  id: number;
  monitor_id: number;
  zone_id: number;
  event_id: number;
  frame_id: number;
  pixel_diff: number;
  alarm_pixels: number;
  filter_pixels: number;
  blob_pixels: number;
  blobs: number;
  min_blob_size: number;
  max_blob_size: number;
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
  score: number;
}

export interface StatQueryParams {
  page?: number;
  page_size?: number;
  /** All stats of one event (zm-api#141). */
  event_id?: number;
  /** Narrow to one frame of that event — the frames page's "+" row. */
  frame_id?: number;
  zone_id?: number;
}

export async function listStats(params?: StatQueryParams): Promise<PaginatedResponse<Stat>> {
  return apiGet<PaginatedResponse<Stat>>('/stats', params as Record<string, string | number | undefined>);
}

/** Every stat row of an event, walking pages (one row per alarmed frame per zone). */
export async function getAllStatsForEvent(eventId: number): Promise<Stat[]> {
  const out: Stat[] = [];
  for (let page = 1; page <= 25; page++) {
    const res = await listStats({ event_id: eventId, page, page_size: 500 });
    out.push(...res.items);
    if (res.current_page >= res.last_page || res.items.length === 0) break;
  }
  return out;
}
