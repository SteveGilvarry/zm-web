import type { ZmEvent } from '@/types';

/**
 * Route params for the frame with the event's max score. Legacy links to
 * `?view=frame&fid=0` and lets the frame view look the frame up
 * (`events.js:108`); zm-api hands the id over directly (zm-api#176), and 0
 * stays the fallback for a backend or event without it.
 */
export function maxScoreFrameParams(event: Pick<ZmEvent, 'id' | 'max_score_frame_id'>): { eventId: string; frameId: string } {
  return { eventId: String(event.id), frameId: String(event.max_score_frame_id ?? 0) };
}
