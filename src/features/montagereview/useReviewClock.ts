import { useCallback, useEffect, useRef, useState } from 'react';
import { useMontageStore } from '@/stores/montage';

/**
 * Browsers refuse to decode much past 16× real time (`HTMLMediaElement`
 * clamps or drops the audio/video pipeline), so a cell plays at most this
 * rate. Legacy has the same ceiling in zms: above it the clock keeps running
 * at the chosen speed and the cell steps by seeking instead of playing.
 */
export const REVIEW_MAX_PLAYBACK_RATE = 16;

/** The rate to hand `video.playbackRate` for a clock speed. */
export function playbackRateFor(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) return 0;
  return Math.min(speed, REVIEW_MAX_PLAYBACK_RATE);
}

/** Above the media ceiling the cell can only step: seek, paint, seek again. */
export function isFrameStepping(speed: number): boolean {
  return speed > REVIEW_MAX_PLAYBACK_RATE;
}

export interface ReviewClock {
  /** Current playhead time. */
  currentTime: Date;
  /** Range bounds — the playhead is clamped here, scrubber spans here. */
  rangeStart: Date;
  rangeEnd: Date;
  /** Running: a speed above 0 with playback started. */
  isPlaying: boolean;
  /**
   * Playback speed multiplier (1 = real time), legacy's 13-step slider.
   * `0` is legacy's pause — the playhead only moves by scrubbing.
   */
  speed: number;

  setCurrentTime: (t: Date) => void;
  /**
   * Move the window. Pass `playhead` to place the playhead in the same call —
   * it is clamped against the range being set, which a following
   * `setCurrentTime` could not do (see the implementation). Without it the
   * playhead keeps its position, pulled to the nearest edge if the new window
   * has left it behind.
   */
  setRange: (start: Date, end: Date, playhead?: Date) => void;
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
  const [started, setStarted] = useState(false);
  // Legacy keeps `speed` in a cookie, so it survives a reload.
  const speed = useMontageStore((st) => st.reviewSpeed);
  const setStoredSpeed = useMontageStore((st) => st.setReviewSpeed);
  // Legacy has no transport: speed 0 IS pause, and moving the slider off 0
  // starts playing. The extra `started` flag only keeps a freshly opened page
  // still (legacy reloads into motion; here that would start every cell
  // fetching video before the operator asked for anything).
  const isPlaying = started && speed > 0;
  // What `play()` resumes at after a pause, or after the window end zeroed
  // the speed.
  const lastMovingSpeed = useRef(speed > 0 ? speed : 1);
  useEffect(() => {
    if (speed > 0) lastMovingSpeed.current = speed;
  }, [speed]);

  const setSpeed = useCallback((s: number) => {
    setStoredSpeed(s);
    setStarted(s > 0);
  }, [setStoredSpeed]);

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

  const setRange = useCallback((start: Date, end: Date, playhead?: Date) => {
    setRangeStart(start);
    setRangeEnd(end);
    // Clamp against the bounds being set, not the ones in state. A caller
    // that did `setRange(a, b)` then `setCurrentTime(a)` would have the second
    // call clamp against the *old* range — React has not committed the new one
    // yet — so jumping to a window that does not overlap the current one
    // pinned the playhead to the old range's edge.
    setCurrentTimeState((prev) => {
      const t = playhead ?? prev;
      const ts = t.getTime();
      if (ts < start.getTime()) return start;
      if (ts > end.getTime()) return end;
      return t;
    });
  }, []);

  const play = useCallback(() => {
    if (useMontageStore.getState().reviewSpeed <= 0) setStoredSpeed(lastMovingSpeed.current);
    setStarted(true);
  }, [setStoredSpeed]);
  // Pause keeps the chosen speed so the slider still reads it on resume;
  // the window end is the one case that zeroes it, as legacy does.
  const pause = useCallback(() => setStarted(false), []);
  const togglePlay = useCallback(() => {
    if (started && useMontageStore.getState().reviewSpeed > 0) setStarted(false);
    else play();
  }, [play, started]);

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
          // Legacy `timerFire`: past the end, `setSpeed(0)` — the slider
          // drops to 0 rather than the page keeping a speed it is not using.
          setStoredSpeed(0);
          setStarted(false);
          return rangeEnd;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [isPlaying, speed, rangeEnd, setStoredSpeed]);

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
