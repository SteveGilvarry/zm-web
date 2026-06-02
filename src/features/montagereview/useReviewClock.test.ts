import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useReviewClock } from './useReviewClock';

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
