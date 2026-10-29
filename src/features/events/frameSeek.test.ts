import { describe, expect, it } from 'vitest';
import { frameAtTime, frameSeekSeconds } from './frameSeek';

describe('frameSeekSeconds', () => {
  it('spaces frames evenly over the event, like the step buttons', () => {
    expect(frameSeekSeconds(1, 300, 60)).toBeNull();      // frame 1 is the start
    expect(frameSeekSeconds(151, 300, 60)).toBe(30);
    expect(frameSeekSeconds(301, 300, 60)).toBe(60);
    expect(frameSeekSeconds(9999, 300, 60)).toBe(60);     // clamped to the length
  });
  it('gives up without a frame count or length', () => {
    expect(frameSeekSeconds(undefined, 300, 60)).toBeNull();
    expect(frameSeekSeconds(10, 0, 60)).toBeNull();
    expect(frameSeekSeconds(10, 300, 0)).toBeNull();
  });
});

describe('frameAtTime', () => {
  const event = { start_date_time: '2026-08-21T02:00:00Z', length: '300.00', frames: 3000 };
  it('maps the playhead to a 1-based frame', () => {
    expect(frameAtTime(event, new Date('2026-08-21T02:00:00Z'))).toBe(1);
    expect(frameAtTime(event, new Date('2026-08-21T02:01:00Z'))).toBe(601);
    expect(frameAtTime(event, new Date('2026-08-21T02:05:00Z'))).toBe(3000);
    expect(frameAtTime(event, new Date('2026-08-21T01:59:00Z'))).toBe(1);
  });
  it('is undefined when the event has no frame count', () => {
    expect(frameAtTime({ ...event, frames: 0 }, new Date('2026-08-21T02:01:00Z'))).toBeUndefined();
  });
});
