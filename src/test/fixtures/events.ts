import type { ZmEvent } from '@/types';
import type { Frame } from '@/api/frames';
import type { Tag } from '@/api/tags';

/**
 * An event as `GET /api/v3/events` serves one. Note the shapes that have
 * bitten us: `length` is a DECIMAL serialised as a string, every boolean is
 * a 0/1 int, and the date columns are `*_date_time` (not `*_datetime`).
 */
export function makeEvent(overrides: Partial<ZmEvent> = {}): ZmEvent {
  return {
    id: 1,
    monitor_id: 1,
    storage_id: 1,
    secondary_storage_id: null,
    name: 'Event-1',
    cause: 'Motion',
    start_date_time: '2026-08-21T09:00:00Z',
    end_date_time: '2026-08-21T09:10:00Z',
    width: 1920,
    height: 1080,
    length: '600.00',
    frames: 9000,
    alarm_frames: 120,
    default_video: '1-video.mp4',
    save_jpe_gs: 0,
    tot_score: 4820,
    avg_score: 40,
    max_score: 96,
    archived: 0,
    videoed: 0,
    uploaded: 0,
    emailed: 0,
    messaged: 0,
    executed: 0,
    notes: null,
    state_id: 1,
    orientation: 'Rotate0',
    disk_space: 41943040,
    scheme: 'Deep',
    locked: 0,
    tags: null,
    ...overrides,
  };
}

/** A frame row (`GET /api/v3/frames?event_id=`). `delta` is a decimal string. */
export function makeFrame(overrides: Partial<Frame> = {}): Frame {
  return {
    id: 1,
    event_id: 1,
    frame_id: 1,
    type: 'Normal',
    score: 0,
    time_stamp: '2026-08-21T09:00:00Z',
    delta: '0.00',
    ...overrides,
  };
}

/** A tag row (`GET /api/v3/tags`). */
export function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 1,
    name: 'Important',
    create_date: '2026-08-01T00:00:00Z',
    event_count: 3,
    ...overrides,
  };
}
