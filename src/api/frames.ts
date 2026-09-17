import { apiGet } from './client';
import { API_BASE } from '@/api/base';
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

/* ------------------------------------------------------------------------ */
/*  Frame images                                                            */
/* ------------------------------------------------------------------------ */

/*
 * Both image routes are `jwt`-secured like `/events/{id}/thumbnail`, and an
 * <img> cannot send an Authorization header, so the token rides in `?token=`
 * exactly as the event thumbnail's does.
 *
 * They answer 404 when the event has no JPEGs on disk — an install recording
 * video only (H.264 passthrough with "Store JPEGs" off) has none at all, and
 * so does every event with no alarm frame when you ask for `fid=alarm`.
 * Callers must cope with the image never arriving.
 */

/** One frame by its `Frames` row id — legacy's `?view=image&fid=`. */
export function getFrameImageUrl(frameId: number, token?: string | null): string {
  const base = `${API_BASE}/frames/${frameId}/image`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

/**
 * One frame of an event by frame number (from 1), or by one of ZoneMinder's
 * names for a frame of interest — legacy's `event.php` `fid=alarm|snapshot`.
 * `objdetect` exists too and is deliberately not offered here.
 */
export type EventFrameRef = number | 'alarm' | 'snapshot';

export function getEventFrameImageUrl(
  eventId: number,
  fid: EventFrameRef,
  token?: string | null,
): string {
  const base = `${API_BASE}/events/${eventId}/frames/${fid}/image`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}
