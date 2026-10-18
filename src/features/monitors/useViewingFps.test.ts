/**
 * Legacy's Viewing FPS, counted client-side from the frames the <video>
 * presents (`requestVideoFrameCallback`).
 */
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useViewingFps } from './useViewingFps';

type FrameCb = (now: number, meta: { presentedFrames: number }) => void;

/** A <video> whose frames the test presents by hand. */
function fakeVideo() {
  const video = document.createElement('video');
  let pending: FrameCb | null = null;
  let cancelled = 0;
  Object.assign(video, {
    requestVideoFrameCallback: (cb: FrameCb) => { pending = cb; return 1; },
    cancelVideoFrameCallback: () => { cancelled += 1; pending = null; },
  });
  return {
    video,
    present: (now: number, presentedFrames: number) => {
      const cb = pending;
      pending = null;
      cb?.(now, { presentedFrames });
    },
    get cancelled() { return cancelled; },
  };
}

describe('useViewingFps', () => {
  it('reports the frames painted per second, refreshed once a second', () => {
    const fake = fakeVideo();
    const ref = { current: fake.video };
    const { result } = renderHook(() => useViewingFps(ref, true));
    expect(result.current).toBeNull();

    act(() => {
      fake.present(0, 100);
      fake.present(500, 106);
      fake.present(1000, 112);
    });
    expect(result.current).toBeCloseTo(12, 6);

    act(() => { fake.present(2000, 137); });
    expect(result.current).toBeCloseTo(25, 6);
  });

  it('blanks the readout and lets go of the callback when the stream stops', () => {
    const fake = fakeVideo();
    const ref = { current: fake.video };
    const { result, rerender } = renderHook(({ on }) => useViewingFps(ref, on), { initialProps: { on: true } });
    act(() => { fake.present(0, 0); fake.present(1000, 10); });
    expect(result.current).toBeCloseTo(10, 6);

    rerender({ on: false });
    expect(result.current).toBeNull();
    expect(fake.cancelled).toBe(1);
  });

  it('stays blank on a browser with no frame callback', () => {
    const ref = { current: document.createElement('video') };
    const { result } = renderHook(() => useViewingFps(ref, true));
    expect(result.current).toBeNull();
  });
});
