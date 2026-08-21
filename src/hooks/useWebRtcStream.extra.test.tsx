/**
 * The half of `useWebRtcStream` the main suite doesn't reach: the effect that
 * attaches the shared MediaStream to *this* component's <video>. It runs after
 * every render on purpose (the element can mount after the stream is known),
 * so it has to be idempotent and it has to detach again when the stream goes.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { WebRtcSnapshot } from '@/streaming/webrtcManager';

const IDLE: WebRtcSnapshot = { state: 'idle', error: null, hasAudio: false, mediaStream: null };

vi.mock('@/streaming/webrtcManager', () => {
  const snapshots = new Map<number, WebRtcSnapshot>();
  const listeners = new Map<number, Set<() => void>>();
  const live = new Set<number>();

  function setSnap(monitorId: number, patch: Partial<WebRtcSnapshot>) {
    snapshots.set(monitorId, { ...(snapshots.get(monitorId) ?? IDLE), ...patch });
    listeners.get(monitorId)?.forEach((l) => l());
  }

  return {
    webrtcManager: {
      acquire: vi.fn((id: number) => { live.add(id); setSnap(id, { state: 'connecting' }); }),
      release: vi.fn(),
      stopHard: vi.fn((id: number) => { live.delete(id); setSnap(id, IDLE); }),
      hasSession: vi.fn((id: number) => live.has(id)),
      subscribe: vi.fn((id: number, listener: () => void) => {
        let set = listeners.get(id);
        if (!set) { set = new Set(); listeners.set(id, set); }
        set.add(listener);
        return () => { listeners.get(id)?.delete(listener); };
      }),
      getSnapshot: vi.fn((id: number) => snapshots.get(id) ?? IDLE),
    },
    __mock: { setSnap, snapshots, listeners, live },
  };
});

import * as managerModule from '@/streaming/webrtcManager';
import { useWebRtcStream } from './useWebRtcStream';

const helpers = (managerModule as unknown as {
  __mock: {
    setSnap: (id: number, patch: Partial<WebRtcSnapshot>) => void;
    snapshots: Map<number, WebRtcSnapshot>;
    listeners: Map<number, Set<() => void>>;
    live: Set<number>;
  };
}).__mock;

beforeEach(() => {
  helpers.snapshots.clear();
  helpers.listeners.clear();
  helpers.live.clear();
});

/** jsdom has no real srcObject; back it with a plain field we can inspect. */
function makeVideo() {
  let srcObject: MediaStream | null = null;
  const video = document.createElement('video');
  Object.defineProperty(video, 'srcObject', {
    get: () => srcObject,
    set: (v: MediaStream | null) => { srcObject = v; },
    configurable: true,
  });
  Object.assign(video, { play: vi.fn(() => Promise.resolve()) });
  return video;
}

const fakeStream = (name: string) => ({ id: name }) as unknown as MediaStream;

describe('useWebRtcStream — attaching the shared stream to the element', () => {
  it('attaches the MediaStream and starts playback once the stream arrives', () => {
    const video = makeVideo();
    const { result } = renderHook(() => useWebRtcStream(11));
    act(() => { result.current.videoRef.current = video; });

    const stream = fakeStream('a');
    act(() => helpers.setSnap(11, { state: 'connected', mediaStream: stream }));

    expect(video.srcObject).toBe(stream);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('does not re-assign or replay when the same stream is published again', () => {
    const video = makeVideo();
    const stream = fakeStream('a');
    const { result } = renderHook(() => useWebRtcStream(12));
    act(() => { result.current.videoRef.current = video; });
    act(() => helpers.setSnap(12, { state: 'connected', mediaStream: stream }));
    expect(video.play).toHaveBeenCalledTimes(1);

    act(() => helpers.setSnap(12, { hasAudio: true }));
    expect(video.srcObject).toBe(stream);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('swaps the element over when the manager publishes a different stream', () => {
    const video = makeVideo();
    const { result } = renderHook(() => useWebRtcStream(13));
    act(() => { result.current.videoRef.current = video; });
    act(() => helpers.setSnap(13, { state: 'connected', mediaStream: fakeStream('a') }));

    const second = fakeStream('b');
    act(() => helpers.setSnap(13, { mediaStream: second }));
    expect(video.srcObject).toBe(second);
    expect(video.play).toHaveBeenCalledTimes(2);
  });

  it('detaches the element when the stream goes away', () => {
    const video = makeVideo();
    const { result } = renderHook(() => useWebRtcStream(14));
    act(() => { result.current.videoRef.current = video; });
    act(() => helpers.setSnap(14, { state: 'connected', mediaStream: fakeStream('a') }));
    expect(video.srcObject).not.toBeNull();

    act(() => helpers.setSnap(14, { state: 'failed', mediaStream: null }));
    expect(video.srcObject).toBeNull();
  });

  it('attaches a stream that was already live when the element mounted late', () => {
    const stream = fakeStream('already-running');
    const { result, rerender } = renderHook(() => useWebRtcStream(15));
    act(() => helpers.setSnap(15, { state: 'connected', mediaStream: stream }));
    expect(result.current.state).toBe('connected');

    // Element appears only now — e.g. after a route's loading skeleton.
    const video = makeVideo();
    result.current.videoRef.current = video;
    rerender();

    expect(video.srcObject).toBe(stream);
    expect(video.play).toHaveBeenCalled();
  });

  it('is a no-op while no element is mounted', () => {
    const { result } = renderHook(() => useWebRtcStream(16));
    expect(() => act(() => helpers.setSnap(16, { mediaStream: fakeStream('a') }))).not.toThrow();
    expect(result.current.videoRef.current).toBeNull();
  });

  it('swallows a rejected play() (autoplay policy) without failing the stream', async () => {
    const video = makeVideo();
    Object.assign(video, { play: vi.fn(() => Promise.reject(new Error('NotAllowedError'))) });
    const { result } = renderHook(() => useWebRtcStream(17));
    act(() => { result.current.videoRef.current = video; });

    act(() => helpers.setSnap(17, { state: 'connected', mediaStream: fakeStream('a') }));
    await act(async () => { await Promise.resolve(); });

    expect(result.current.state).toBe('connected');
  });
});
