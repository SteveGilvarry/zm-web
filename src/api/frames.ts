import { apiGet } from './client';
import type { PaginatedResponse } from '@/types';

/** Per-frame record from `/api/v3/frames`. */
export interface Frame {
  id: number;
  event_id: number;
  frame_id: number;
  /** Frame type — e.g. "Normal", "Alarm", "Bulk". */
  type: string;
  /** Per-frame motion score (0..∞). */
  score: number;
  /** Wall-clock ISO timestamp the frame was captured. */
  time_stamp: string;
  /** Seconds offset from the event start (as a string per backend). */
  delta: string;
}

export async function listFrames(
  params: { event_id: number; page?: number; page_size?: number },
): Promise<PaginatedResponse<Frame>> {
  return apiGet<PaginatedResponse<Frame>>(
    '/frames',
    params as Record<string, string | number | undefined>,
  );
}

/**
 * Fetch every frame for an event by walking pages. Frames per event range
 * from a few dozen to several thousand; we cap pagination at 25 pages of 500
 * to bound worst-case requests.
 */
export async function getAllFramesForEvent(eventId: number): Promise<Frame[]> {
  const out: Frame[] = [];
  for (let page = 1; page <= 25; page++) {
    const res = await listFrames({ event_id: eventId, page, page_size: 500 });
    out.push(...res.items);
    if (res.current_page >= res.last_page || res.items.length === 0) break;
  }
  return out;
}
