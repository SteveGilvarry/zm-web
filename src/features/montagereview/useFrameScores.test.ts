/**
 * Frame shading on the review timeline: which events are worth a `/frames`
 * request, and legacy `drawFrameOnGraph`'s alpha curve.
 */
import { describe, expect, it } from 'vitest';
import type { ZmEvent } from '@/types';
import { FRAME_SCORE_EVENT_LIMIT, frameAlpha, frameScoreTargets } from './useFrameScores';

const ev = (id: number, over: Partial<ZmEvent> = {}): ZmEvent =>
  ({ id, monitor_id: 1, alarm_frames: 3, max_score: 40, ...over } as unknown as ZmEvent);

describe('frameScoreTargets', () => {
  it('skips events with no alarm frames or no score', () => {
    const rows = frameScoreTargets([
      ev(1),
      ev(2, { alarm_frames: 0 }),
      ev(3, { max_score: 0 }),
    ]);
    expect(rows.map((e) => e.id)).toEqual([1]);
  });

  it('takes the highest-scoring events first and caps the request count', () => {
    const many = Array.from({ length: FRAME_SCORE_EVENT_LIMIT + 5 }, (_, i) =>
      ev(i + 1, { max_score: i + 1 }));
    const rows = frameScoreTargets(many);
    expect(rows).toHaveLength(FRAME_SCORE_EVENT_LIMIT);
    expect(rows[0].id).toBe(many.length);
  });

  it('honours a caller-supplied limit', () => {
    expect(frameScoreTargets([ev(1), ev(2), ev(3)], 2)).toHaveLength(2);
  });
});

describe('frameAlpha', () => {
  it('follows legacy: the top score is the lightest, the lowest the darkest', () => {
    // 0.4 + 0.6 × (1 − Score/maxScore)
    expect(frameAlpha(100, 100)).toBeCloseTo(0.4, 5);
    expect(frameAlpha(50, 100)).toBeCloseTo(0.7, 5);
    expect(frameAlpha(1, 100)).toBeCloseTo(0.994, 3);
  });

  it('is fully opaque when there is no maximum to scale against', () => {
    expect(frameAlpha(10, 0)).toBe(1);
  });

  it('clamps a score above the maximum instead of going translucent', () => {
    expect(frameAlpha(200, 100)).toBeCloseTo(0.4, 5);
  });
});
