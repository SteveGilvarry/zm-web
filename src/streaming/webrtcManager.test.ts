import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// connect() now POSTs /start with { enable_webrtc: true } before opening the WS.
// Stub that call so tests exercise the ref-counting / signaling pipeline without
// hitting the network. getWebRtcWebsocketUrl is left real (it only touches
// window.location + the auth store).
vi.mock('@/api/monitors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/monitors')>();
  return {
    ...actual,
    startLiveStream: vi.fn(async (monitorId: number) => ({
      monitor_id: monitorId,
      status: 'started',
      webrtc_signaling: `/api/v3/live/${monitorId}/webrtc/ws`,
    })),
  };
});

import { webrtcManager } from './webrtcManager';

/**
 * The WebRTC manager is module-scoped (sessions Map lives at module load).
 * Tests verify the acquire/release ref-counting and grace-period teardown
 * behaviour. The actual signaling pipeline is stubbed via MockWebSocket
 * and MockRTCPeerConnection in vitest.setup.ts so connect() doesn't blow
 * up when called.
 *
 * Each test releases anything it acquired in cleanup so the shared session
 * map doesn't leak state between tests.
 */

describe('webrtcManager — initial state', () => {
  it('reports state="idle" for a monitor that has never been acquired', () => {
    const snap = webrtcManager.getSnapshot(999_001);
    expect(snap.state).toBe('idle');
    expect(snap.hasAudio).toBe(false);
  });
});

describe('webrtcManager — acquire / release ref-counting', () => {
  const MID = 999_100;

  afterEach(() => {
    // Force-clean any session this test created so state doesn't bleed.
    webrtcManager.stopHard(MID);
  });

  it('first acquire flips snapshot state away from idle', () => {
    expect(webrtcManager.getSnapshot(MID).state).toBe('idle');
    webrtcManager.acquire(MID);
    // After acquire, connect() runs and patches state → 'connecting'.
    expect(webrtcManager.getSnapshot(MID).state).toBe('connecting');
  });

  it('two acquires + one release keeps the stream alive (refCount stays positive)', () => {
    vi.useFakeTimers();
    webrtcManager.acquire(MID);
    webrtcManager.acquire(MID);
    webrtcManager.release(MID); // back to 1 ref, no grace timer
    // Advance well past the grace period — stream must still be alive.
    vi.advanceTimersByTime(20_000);
    expect(webrtcManager.getSnapshot(MID).state).not.toBe('idle');
    vi.useRealTimers();
  });

  it('release at zero refs schedules a grace-period teardown', () => {
    vi.useFakeTimers();
    webrtcManager.acquire(MID);
    expect(webrtcManager.getSnapshot(MID).state).toBe('connecting');

    webrtcManager.release(MID);
    // Within grace period: still alive.
    vi.advanceTimersByTime(5_000);
    expect(webrtcManager.getSnapshot(MID).state).toBe('connecting');

    // Past grace period (8 s): torn down.
    vi.advanceTimersByTime(5_000);
    expect(webrtcManager.getSnapshot(MID).state).toBe('idle');
    vi.useRealTimers();
  });

  it('re-acquiring during the grace period cancels the teardown', () => {
    vi.useFakeTimers();
    webrtcManager.acquire(MID);
    webrtcManager.release(MID);
    // Halfway through the grace period: cancel by acquiring again.
    vi.advanceTimersByTime(4_000);
    webrtcManager.acquire(MID);
    // Past what would have been the original teardown time.
    vi.advanceTimersByTime(10_000);
    expect(webrtcManager.getSnapshot(MID).state).not.toBe('idle');
    vi.useRealTimers();
  });

  it('release on an unknown monitor is a no-op', () => {
    // Doesn't throw, doesn't leak, doesn't alter other sessions.
    expect(() => webrtcManager.release(999_999)).not.toThrow();
  });

  it('release without prior acquire does nothing', () => {
    webrtcManager.release(MID);
    expect(webrtcManager.getSnapshot(MID).state).toBe('idle');
  });
});

describe('webrtcManager — stopHard', () => {
  const MID = 999_200;

  it('tears down the session immediately regardless of refCount', () => {
    webrtcManager.acquire(MID);
    webrtcManager.acquire(MID); // refCount = 2
    expect(webrtcManager.getSnapshot(MID).state).not.toBe('idle');
    webrtcManager.stopHard(MID);
    expect(webrtcManager.getSnapshot(MID).state).toBe('idle');
  });
});

describe('webrtcManager — subscribe', () => {
  const MID = 999_300;

  beforeEach(() => webrtcManager.stopHard(MID));
  afterEach(() => webrtcManager.stopHard(MID));

  it('notifies subscribers when the snapshot changes', () => {
    const listener = vi.fn();
    const unsub = webrtcManager.subscribe(MID, listener);

    webrtcManager.acquire(MID);
    expect(listener).toHaveBeenCalled(); // state went idle → connecting

    unsub();
  });

  it('does not notify after unsubscribe', () => {
    const listener = vi.fn();
    const unsub = webrtcManager.subscribe(MID, listener);
    unsub();
    webrtcManager.acquire(MID);
    expect(listener).not.toHaveBeenCalled();
  });
});
