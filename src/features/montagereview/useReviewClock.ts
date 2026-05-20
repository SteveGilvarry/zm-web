import { useCallback, useEffect, useRef, useState } from 'react';

export interface ReviewClock {
  /** Current playhead time. */
  currentTime: Date;
  /** Range bounds — the playhead is clamped here, scrubber spans here. */
  rangeStart: Date;
  rangeEnd: Date;
  isPlaying: boolean;
  /** Playback speed multiplier (1 = real time). */
  speed: number;

  setCurrentTime: (t: Date) => void;
  setRange: (start: Date, end: Date) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (s: number) => void;
}

/**
 * Master playhead for the Montage Review page. Holds a wall-clock timestamp
 * that all per-monitor cells render to. Advances at `speed × wall time`
 * while playing, clamps to the range bounds, and exposes scrub setters.
 */
export function useReviewClock(initialStart: Date, initialEnd: Date): ReviewClock {
  const [rangeStart, setRangeStart] = useState(initialStart);
  const [rangeEnd, setRangeEnd] = useState(initialEnd);
  const [currentTime, setCurrentTimeState] = useState(initialStart);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // Clamp helper
  const clamp = useCallback((t: Date) => {
    const ts = t.getTime();
    if (ts < rangeStart.getTime()) return rangeStart;
    if (ts > rangeEnd.getTime()) return rangeEnd;
    return t;
  }, [rangeStart, rangeEnd]);

  const setCurrentTime = useCallback((t: Date) => {
    setCurrentTimeState(clamp(t));
  }, [clamp]);

  const setRange = useCallback((start: Date, end: Date) => {
    setRangeStart(start);
    setRangeEnd(end);
    // Re-clamp the playhead if it now sits outside the new range.
    setCurrentTimeState((prev) => {
      const ts = prev.getTime();
      if (ts < start.getTime()) return start;
      if (ts > end.getTime()) return end;
      return prev;
    });
  }, []);

  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);
  const togglePlay = useCallback(() => setIsPlaying((p) => !p), []);

  // Advance the clock while playing.
  const lastTickRef = useRef<number>(0);
  useEffect(() => {
    if (!isPlaying) return;
    lastTickRef.current = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const elapsed = (now - lastTickRef.current) * speed;
      lastTickRef.current = now;
      setCurrentTimeState((prev) => {
        const next = new Date(prev.getTime() + elapsed);
        if (next.getTime() >= rangeEnd.getTime()) {
          // Stop at the end of the range.
          setIsPlaying(false);
          return rangeEnd;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [isPlaying, speed, rangeEnd]);

  return {
    currentTime,
    rangeStart,
    rangeEnd,
    isPlaying,
    speed,
    setCurrentTime,
    setRange,
    play,
    pause,
    togglePlay,
    setSpeed,
  };
}
