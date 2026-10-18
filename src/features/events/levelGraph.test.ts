import { describe, expect, it } from 'vitest';
import type { Frame } from '@/api/frames';
import {
  levelGraphBands, levelGraphPoints, levelGraphSampleAt, levelGraphScoreAt, levelGraphSeries,
} from './levelGraph';

function frame(frame_id: number, delta: string, score: number, type = 'Normal'): Frame {
  return { id: frame_id, event_id: 1, frame_id, type, score, time_stamp: '', delta };
}

describe('levelGraphSeries', () => {
  it('sorts by time, clamps into the event and drops unparseable deltas', () => {
    const s = levelGraphSeries(
      [frame(2, '4', 10), frame(1, '0', 3), frame(3, 'x', 99), frame(4, '12', 40)],
      10,
    );
    expect(s.samples.map((p) => [p.t, p.score])).toEqual([[0, 3], [4, 10], [10, 40]]);
    expect(s.motionMax).toBe(40);
    expect(s.hasScores).toBe(true);
  });

  it('draws no line for an event that never scored', () => {
    expect(levelGraphSeries([frame(1, '0', 0), frame(2, '1', 0)], 2).hasScores).toBe(false);
  });
});

describe('levelGraphBands', () => {
  it('covers each alarm frame to the next frame and merges touching ones', () => {
    const { samples } = levelGraphSeries([
      frame(1, '0', 0),
      frame(2, '1', 5, 'Alarm'),
      frame(3, '2', 9, 'Alarm'),
      frame(4, '3', 0),
      frame(5, '5', 0, 'Bulk'),
      frame(6, '6', 7, 'Alarm'),
    ], 8);
    // The last alarm frame runs to the end of the event; Bulk is not an alarm.
    expect(levelGraphBands(samples, 8)).toEqual([{ start: 1, end: 3 }, { start: 6, end: 8 }]);
  });
});

describe('levelGraphPoints', () => {
  it('scales the score to the event peak on a box whose floor is the bottom', () => {
    const { samples, motionMax } = levelGraphSeries([frame(1, '0', 0), frame(2, '5', 50), frame(3, '10', 100)], 10);
    // 100 wide, 22 tall: 2 px of headroom, so the peak sits at y=2.
    expect(levelGraphPoints(samples, 10, motionMax, 100, 22)).toBe('0,22 50,12 100,2');
  });
});

describe('levelGraphSampleAt / levelGraphScoreAt', () => {
  const series = levelGraphSeries([frame(1, '0', 1), frame(2, '4', 8), frame(3, '10', 3)], 10);

  it('reads the nearest sample, not the one before', () => {
    expect(levelGraphSampleAt(series.samples, 3)?.score).toBe(8);
    expect(levelGraphSampleAt(series.samples, 1.9)?.score).toBe(1);
    expect(levelGraphSampleAt(series.samples, 99)?.score).toBe(3);
    expect(levelGraphSampleAt([], 1)).toBeNull();
  });

  it('has nothing to read on an event without scores', () => {
    expect(levelGraphScoreAt(series, 4)).toBe(8);
    expect(levelGraphScoreAt(levelGraphSeries([frame(1, '0', 0)], 1), 0)).toBeNull();
  });
});
