import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { WebRtcSnapshot } from '@/streaming/webrtcManager';

/**
 * useWebRtcStream is a thin subscriber over the module-scoped webrtcManager.
 * The factory is hoisted, so the mock funcs themselves live inside it and
 * tests reach them via the mocked module import below.
 */

const IDLE: WebRtcSnapshot = {
  state: 'idle',
  error: null,
  hasAudio: false,
  mediaStream: null,
};

vi.mock('@/streaming/webrtcManager', () => {
  const snapshotByMonitor = new Map<number, WebRtcSnapshot>();
  const listenersByMonitor = new Map<number, Set<() => void>>();

  function setSnap(monitorId: number, patch: Partial<WebRtcSnapshot>) {
    const prev = snapshotByMonitor.get(monitorId) ?? IDLE;
    snapshotByMonitor.set(monitorId, { ...prev, ...patch });
    listenersByMonitor.get(monitorId)?.forEach((l) => l());
  }

  const acquire = vi.fn((monitorId: number) => {
    setSnap(monitorId, { state: 'connecting' });
  });
  const release = vi.fn();
  const stopHard = vi.fn((monitorId: number) => {
    setSnap(monitorId, IDLE);
  });
  const subscribe = vi.fn((monitorId: number, listener: () => void) => {
    let set = listenersByMonitor.get(monitorId);
    if (!set) {
      set = new Set();
      listenersByMonitor.set(monitorId, set);
    }
    set.add(listener);
    return () => {
      listenersByMonitor.get(monitorId)?.delete(listener);
    };
  });
  const getSnapshot = vi.fn(
    (monitorId: number) => snapshotByMonitor.get(monitorId) ?? IDLE,
  );

  return {
    webrtcManager: { acquire, release, stopHard, subscribe, getSnapshot },
    // expose helpers for tests
    __mock: { setSnap, snapshotByMonitor, listenersByMonitor },
  };
});

// Pull the mocked module so we can reach into its handles.
import * as managerModule from '@/streaming/webrtcManager';
import { useWebRtcStream } from './useWebRtcStream';

const { webrtcManager } = managerModule;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockHelpers = (managerModule as any).__mock as {
  setSnap: (monitorId: number, patch: Partial<WebRtcSnapshot>) => void;
  snapshotByMonitor: Map<number, WebRtcSnapshot>;
  listenersByMonitor: Map<number, Set<() => void>>;
};

const acquireMock = webrtcManager.acquire as ReturnType<typeof vi.fn>;
const releaseMock = webrtcManager.release as ReturnType<typeof vi.fn>;
const stopHardMock = webrtcManager.stopHard as ReturnType<typeof vi.fn>;
const subscribeMock = webrtcManager.subscribe as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockHelpers.snapshotByMonitor.clear();
  mockHelpers.listenersByMonitor.clear();
  acquireMock.mockClear();
  releaseMock.mockClear();
  stopHardMock.mockClear();
  subscribeMock.mockClear();
});

afterEach(() => {
  mockHelpers.snapshotByMonitor.clear();
  mockHelpers.listenersByMonitor.clear();
});

describe('useWebRtcStream — initial shape', () => {
  it('returns the StreamHookResult shape with idle snapshot fields', () => {
    const { result } = renderHook(() => useWebRtcStream(1));
    expect(result.current.state).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.hasAudio).toBe(false);
    expect(typeof result.current.start).toBe('function');
    expect(typeof result.current.stop).toBe('function');
    // videoRef is a React ref (object with a writable `current`).
    expect(result.current.videoRef).toBeDefined();
    expect('current' in result.current.videoRef).toBe(true);
  });
});

describe('useWebRtcStream — start / stop', () => {
  it('start() calls webrtcManager.acquire with the monitorId', () => {
    const { result } = renderHook(() => useWebRtcStream(42));
    act(() => result.current.start());
    expect(acquireMock).toHaveBeenCalledTimes(1);
    expect(acquireMock).toHaveBeenCalledWith(42);
  });

  it('start() is idempotent — calling twice only acquires once', () => {
    const { result } = renderHook(() => useWebRtcStream(42));
    act(() => result.current.start());
    act(() => result.current.start());
    expect(acquireMock).toHaveBeenCalledTimes(1);
  });

  it('stop() calls webrtcManager.stopHard with the monitorId', () => {
    const { result } = renderHook(() => useWebRtcStream(42));
    act(() => result.current.start());
    act(() => result.current.stop());
    expect(stopHardMock).toHaveBeenCalledTimes(1);
    expect(stopHardMock).toHaveBeenCalledWith(42);
  });
});

describe('useWebRtcStream — manager subscription drives re-renders', () => {
  it('subscribes to the manager for the requested monitorId', () => {
    renderHook(() => useWebRtcStream(7));
    expect(subscribeMock).toHaveBeenCalled();
    // First positional arg is monitorId.
    expect(subscribeMock.mock.calls[0][0]).toBe(7);
  });

  it('re-renders with the new state when the manager publishes a snapshot change', () => {
    const { result } = renderHook(() => useWebRtcStream(7));
    expect(result.current.state).toBe('idle');

    act(() => mockHelpers.setSnap(7, { state: 'connected', hasAudio: true }));
    expect(result.current.state).toBe('connected');
    expect(result.current.hasAudio).toBe(true);
  });

  it('surfaces an error from the snapshot through the hook', () => {
    const { result } = renderHook(() => useWebRtcStream(7));
    act(() => mockHelpers.setSnap(7, { state: 'failed', error: 'boom' }));
    expect(result.current.state).toBe('failed');
    expect(result.current.error).toBe('boom');
  });
});

describe('useWebRtcStream — unmount cleanup', () => {
  it('releases the manager reference on unmount when start() ran', () => {
    const { result, unmount } = renderHook(() => useWebRtcStream(99));
    act(() => result.current.start());
    expect(releaseMock).not.toHaveBeenCalled();
    unmount();
    expect(releaseMock).toHaveBeenCalledWith(99);
  });

  it('does not call release on unmount if start() was never called', () => {
    const { unmount } = renderHook(() => useWebRtcStream(99));
    unmount();
    expect(releaseMock).not.toHaveBeenCalled();
  });
});
