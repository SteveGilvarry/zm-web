import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMontageStore, DEFAULT_REVIEW_SPEED } from '@/stores/montage';
import {
  REVIEW_MAX_PLAYBACK_RATE, isFrameStepping, playbackRateFor, useReviewClock,
} from './useReviewClock';

const START = new Date('2026-05-24T12:00:00Z');
const END   = new Date('2026-05-24T13:00:00Z'); // +1 hour

describe('useReviewClock — initial state', () => {
  it('starts paused at the range start', () => {
    const { result } = renderHook(() => useReviewClock(START, END));
    expect(result.current.currentTime.toISOString()).toBe(START.toISOString());
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.speed).toBe(1);
    expect(result.current.rangeStart).toEqual(START);
    expect(result.current.rangeEnd).toEqual(END);
  });
});

describe('useReviewClock — play / pause / togglePlay', () => {
  it('play() sets isPlaying=true; pause() unsets', () => {
    const { result } = renderHook(() => useReviewClock(START, END));
    act(() => result.current.play());
    expect(result.current.isPlaying).toBe(true);
    act(() => result.current.pause());
    expect(result.current.isPlaying).toBe(false);
  });

  it('togglePlay flips state each call', () => {
    const { result } = renderHook(() => useReviewClock(START, END));
    act(() => result.current.togglePlay());
    expect(result.current.isPlaying).toBe(true);
    act(() => result.current.togglePlay());
    expect(result.current.isPlaying).toBe(false);
  });
});

describe('useReviewClock — setCurrentTime clamping', () => {
  it('clamps a time before rangeStart to rangeStart', () => {
    const { result } = renderHook(() => useReviewClock(START, END));
    const tooEarly = new Date(START.getTime() - 60_000);
    act(() => result.current.setCurrentTime(tooEarly));
    expect(result.current.currentTime).toEqual(START);
  });

  it('clamps a time after rangeEnd to rangeEnd', () => {
    const { result } = renderHook(() => useReviewClock(START, END));
    const tooLate = new Date(END.getTime() + 60_000);
    act(() => result.current.setCurrentTime(tooLate));
    expect(result.current.currentTime).toEqual(END);
  });

  it('keeps an in-range time unchanged', () => {
    const { result } = renderHook(() => useReviewClock(START, END));
    const mid = new Date(START.getTime() + 30 * 60_000); // 30 min in
    act(() => result.current.setCurrentTime(mid));
    expect(result.current.currentTime).toEqual(mid);
  });
});

describe('useReviewClock — setRange re-clamps the playhead', () => {
  it('shifts the playhead forward when the new range starts after the old playhead', () => {
    const { result } = renderHook(() => useReviewClock(START, END));
    // Scrub to a known mid-point.
    const mid = new Date(START.getTime() + 10 * 60_000);
    act(() => result.current.setCurrentTime(mid));
    expect(result.current.currentTime).toEqual(mid);

    // New range starts AFTER the current playhead — playhead snaps forward.
    const newStart = new Date(START.getTime() + 30 * 60_000);
    const newEnd = new Date(END.getTime() + 30 * 60_000);
    act(() => result.current.setRange(newStart, newEnd));
    expect(result.current.currentTime).toEqual(newStart);
  });

  it('shifts the playhead back when the new range ends before the old playhead', () => {
    const { result } = renderHook(() => useReviewClock(START, END));
    // Playhead at 50 min in.
    const farIn = new Date(START.getTime() + 50 * 60_000);
    act(() => result.current.setCurrentTime(farIn));

    // New range tightens to first 30 minutes.
    const newEnd = new Date(START.getTime() + 30 * 60_000);
    act(() => result.current.setRange(START, newEnd));
    expect(result.current.currentTime).toEqual(newEnd);
  });

  it('leaves the playhead alone when it still sits inside the new range', () => {
    const { result } = renderHook(() => useReviewClock(START, END));
    const mid = new Date(START.getTime() + 30 * 60_000);
    act(() => result.current.setCurrentTime(mid));

    // Widen the range — playhead is still inside.
    const newStart = new Date(START.getTime() - 10 * 60_000);
    const newEnd = new Date(END.getTime() + 10 * 60_000);
    act(() => result.current.setRange(newStart, newEnd));
    expect(result.current.currentTime).toEqual(mid);
  });

  it('places the playhead in the same call, clamped to the bounds being set', () => {
    const { result } = renderHook(() => useReviewClock(START, END));
    const newStart = new Date('2026-03-01T00:00:00Z');
    const newEnd = new Date('2026-03-01T06:00:00Z');

    // The window does not overlap the old one, so a playhead clamped against
    // the range still in state would land on the old edge (F-25).
    act(() => result.current.setRange(newStart, newEnd, newStart));
    expect(result.current.currentTime).toEqual(newStart);

    // A playhead outside the new window is pulled to its nearer edge.
    act(() => result.current.setRange(newStart, newEnd, new Date('2026-03-01T09:00:00Z')));
    expect(result.current.currentTime).toEqual(newEnd);

    // Omitting it keeps the playhead where it is.
    act(() => result.current.setRange(newStart, newEnd));
    expect(result.current.currentTime).toEqual(newEnd);
  });
});

describe('useReviewClock — playback advances the clock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('advances currentTime forward while playing', () => {
    const { result } = renderHook(() => useReviewClock(START, END));
    act(() => result.current.play());
    // 100ms interval × speed 1 → ~100ms per tick. Advance 1s → expect ~1s
    // forward in playhead time (the hook's elapsed math uses performance.now
    // which fake timers don't drive directly — but vi.advanceTimersByTime
    // also moves performance.now via vitest's fakeTimers config).
    act(() => { vi.advanceTimersByTime(1_000); });
    const advancedMs = result.current.currentTime.getTime() - START.getTime();
    // Should have moved by roughly the wall-clock interval. Allow generous
    // slack — exact value depends on the timer scheduler.
    expect(advancedMs).toBeGreaterThan(0);
  });

  it('stops at rangeEnd when playback would overshoot', () => {
    // Tight range: 1 second.
    const tightEnd = new Date(START.getTime() + 1_000);
    const { result } = renderHook(() => useReviewClock(START, tightEnd));
    act(() => result.current.setSpeed(100)); // very fast
    act(() => result.current.play());
    // Advance far past the end.
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.currentTime).toEqual(tightEnd);
    expect(result.current.isPlaying).toBe(false); // auto-paused at end
  });
});

describe('useReviewClock — legacy speed semantics', () => {
  beforeEach(() => {
    useMontageStore.setState({ reviewSpeed: DEFAULT_REVIEW_SPEED });
  });

  it('speed 0 is pause: the clock is not playing and will not advance', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useReviewClock(START, END));
      act(() => result.current.play());
      expect(result.current.isPlaying).toBe(true);

      act(() => result.current.setSpeed(0));
      expect(result.current.isPlaying).toBe(false);
      const at = result.current.currentTime.getTime();
      act(() => { vi.advanceTimersByTime(2_000); });
      expect(result.current.currentTime.getTime()).toBe(at);
    } finally {
      vi.useRealTimers();
    }
  });

  it('moving the slider off 0 starts playing, as legacy does', () => {
    const { result } = renderHook(() => useReviewClock(START, END));
    act(() => result.current.setSpeed(0));
    act(() => result.current.setSpeed(0.1));
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.speed).toBe(0.1);
  });

  it('play() after the window end restores the last moving speed', () => {
    vi.useFakeTimers();
    try {
      const tightEnd = new Date(START.getTime() + 1_000);
      const { result } = renderHook(() => useReviewClock(START, tightEnd));
      act(() => result.current.setSpeed(3));
      act(() => { vi.advanceTimersByTime(5_000); });
      // Legacy's `timerFire` zeroes the slider at the end of the window.
      expect(result.current.speed).toBe(0);
      expect(result.current.isPlaying).toBe(false);

      act(() => result.current.play());
      expect(result.current.speed).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('pause keeps the chosen speed so resume reads the same', () => {
    const { result } = renderHook(() => useReviewClock(START, END));
    act(() => result.current.setSpeed(5));
    act(() => result.current.pause());
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.speed).toBe(5);
    act(() => result.current.togglePlay());
    expect(result.current.isPlaying).toBe(true);
  });
});

describe('playbackRateFor / isFrameStepping', () => {
  it('caps at what a browser will decode', () => {
    expect(playbackRateFor(1)).toBe(1);
    expect(playbackRateFor(16)).toBe(REVIEW_MAX_PLAYBACK_RATE);
    expect(playbackRateFor(50)).toBe(REVIEW_MAX_PLAYBACK_RATE);
  });

  it('is 0 at pause and for nonsense', () => {
    expect(playbackRateFor(0)).toBe(0);
    expect(playbackRateFor(Number.NaN)).toBe(0);
  });

  it('says when the cell has to step instead of play', () => {
    expect(isFrameStepping(16)).toBe(false);
    expect(isFrameStepping(20)).toBe(true);
    expect(isFrameStepping(50)).toBe(true);
  });
});
