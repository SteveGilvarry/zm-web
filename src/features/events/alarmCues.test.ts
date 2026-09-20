import { describe, expect, it } from 'vitest';
import type { Frame } from '@/api/frames';
import { alarmRuns, isAlarmFrame } from './alarmCues';

const frame = (frameId: number, type: string, delta: number, score = 0): Frame => ({
  id: frameId,
  event_id: 1,
  frame_id: frameId,
  type,
  score,
  time_stamp: '2026-09-17T12:00:00Z',
  delta: String(delta),
});

describe('alarmRuns', () => {
  it('groups contiguous alarm frames and takes the run\'s peak score', () => {
    const runs = alarmRuns([
      frame(1, 'Normal', 0),
      frame(2, 'Alarm', 1, 20),
      frame(3, 'Alarm', 2, 60),
      frame(4, 'Normal', 3),
      frame(5, 'Alarm', 4, 15),
      frame(6, 'Normal', 5),
    ]);
    expect(runs).toEqual([
      { start: 1, end: 3, score: 60 },
      { start: 4, end: 5, score: 15 },
    ]);
  });

  it('closes a run that reaches the end of the event', () => {
    expect(alarmRuns([frame(1, 'Normal', 0), frame(2, 'Alarm', 1, 9)])).toEqual([
      { start: 1, end: 1, score: 9 },
    ]);
  });

  it('has no runs for an event without alarm frames', () => {
    expect(alarmRuns([frame(1, 'Normal', 0), frame(2, 'Normal', 1)])).toEqual([]);
  });

  it('skips frames whose delta is not a number', () => {
    const broken = { ...frame(1, 'Alarm', 0, 5), delta: 'n/a' };
    expect(alarmRuns([broken, frame(2, 'Alarm', 2, 7)])).toEqual([
      { start: 2, end: 2, score: 7 },
    ]);
  });

  it('counts only Alarm frames, as legacy does', () => {
    expect(isAlarmFrame(frame(1, 'Alarm', 0))).toBe(true);
    // Bulk is the sampled frame of a continuous recording, not an alarm.
    expect(isAlarmFrame(frame(1, 'Bulk', 0))).toBe(false);
    expect(isAlarmFrame(frame(1, 'Normal', 0))).toBe(false);
  });
});
