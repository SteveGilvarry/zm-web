import type { ZmEvent } from '@/types';

/**
 * Legacy opens an event at a frame (`?view=event&eid=&fid=`, from the
 * timeline's cells and Montage Review's playhead) and seeks the player
 * there. Frames are evenly spaced for this: `Length / Frames` seconds each,
 * the same `spf` the frame-step buttons use.
 */
export function frameSeekSeconds(fid: number | undefined, frames: number, lengthSeconds: number): number | null {
  if (!fid || fid <= 1 || !(frames > 0) || !(lengthSeconds > 0)) return null;
  const spf = lengthSeconds / frames;
  return Math.min(lengthSeconds, (Math.floor(fid) - 1) * spf);
}

/** The frame number under a wall-clock instant, 1-based and clamped to the event. */
export function frameAtTime(event: Pick<ZmEvent, 'start_date_time' | 'length' | 'frames'>, at: Date): number | undefined {
  const frames = Number(event.frames) || 0;
  const length = Number(event.length) || 0;
  const start = new Date(event.start_date_time ?? '').getTime();
  if (!(frames > 0) || !(length > 0) || Number.isNaN(start)) return undefined;
  const offset = (at.getTime() - start) / 1000;
  if (offset <= 0) return 1;
  return Math.max(1, Math.min(frames, Math.floor((offset / length) * frames) + 1));
}
