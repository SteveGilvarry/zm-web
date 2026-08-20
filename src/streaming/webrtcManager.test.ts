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

/* -------------------------------------------------------------------------- */
/*  Reconnect policy — drives the fake transports the global setup installs   */
/* -------------------------------------------------------------------------- */

import { WEBRTC_TIMING } from './webrtcManager';

type FakeWs = WebSocket & {
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  sent: string[];
};
type FakePc = RTCPeerConnection & {
  connectionState: RTCPeerConnectionState;
  onconnectionstatechange: (() => void) | null;
};

/** Installs recording WebSocket / RTCPeerConnection fakes for one test. */
function installTransports() {
  const sockets: FakeWs[] = [];
  const pcs: FakePc[] = [];
  const RealWs = globalThis.WebSocket;
  const RealPc = globalThis.RTCPeerConnection;

  class RecWs {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readyState = 1;
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    sent: string[] = [];
    url: string;
    constructor(url: string) {
      this.url = url;
      sockets.push(this as unknown as FakeWs);
    }
    send(data: string) { this.sent.push(data); }
    close() { this.readyState = 3; }
  }
  class RecPc {
    connectionState: RTCPeerConnectionState = 'new';
    ontrack: unknown = null;
    onicecandidate: unknown = null;
    onconnectionstatechange: (() => void) | null = null;
    constructor() { pcs.push(this as unknown as FakePc); }
    async setRemoteDescription() {}
    async setLocalDescription() {}
    async createAnswer() { return { sdp: '', type: 'answer' as const }; }
    async addIceCandidate() {}
    close() {}
  }
  globalThis.WebSocket = RecWs as unknown as typeof WebSocket;
  globalThis.RTCPeerConnection = RecPc as unknown as typeof RTCPeerConnection;
  if (!('RTCSessionDescription' in globalThis)) {
    // @ts-expect-error — jsdom has no WebRTC; a bag of fields is enough.
    globalThis.RTCSessionDescription = class { constructor(public init: unknown) {} };
  }
  return {
    sockets,
    pcs,
    restore() {
      globalThis.WebSocket = RealWs;
      globalThis.RTCPeerConnection = RealPc;
    },
  };
}

/** Let connect() get past the mocked /start and open its socket. */
async function settle() {
  await vi.advanceTimersByTimeAsync(0);
}

function openAndOffer(ws: FakeWs) {
  ws.onopen?.();
  ws.onmessage?.({ data: JSON.stringify({ type: 'offer', session_id: 's1', sdp: 'v=0' }) });
}

describe('webrtcManager — reconnect policy', () => {
  const MID = 999_400;
  let transports: ReturnType<typeof installTransports>;

  beforeEach(() => {
    vi.useFakeTimers();
    transports = installTransports();
  });
  afterEach(() => {
    webrtcManager.stopHard(MID);
    transports.restore();
    vi.useRealTimers();
  });

  it('ICE "failed" schedules a reconnect instead of parking in failed', async () => {
    webrtcManager.acquire(MID);
    await settle();
    expect(transports.sockets).toHaveLength(1);
    openAndOffer(transports.sockets[0]);
    await settle();
    const pc = transports.pcs[0];
    pc.connectionState = 'failed';
    pc.onconnectionstatechange?.();

    const snap = webrtcManager.getSnapshot(MID);
    expect(snap.state).toBe('connecting');
    expect(snap.error).toMatch(/WebRTC connection failed, retrying \(1\/5\)/);

    await vi.advanceTimersByTimeAsync(WEBRTC_TIMING.BASE_RECONNECT_DELAY_MS);
    expect(transports.sockets).toHaveLength(2);
  });

  it('ICE "disconnected" only reconnects if it does not heal within the grace period', async () => {
    webrtcManager.acquire(MID);
    await settle();
    openAndOffer(transports.sockets[0]);
    await settle();
    const pc = transports.pcs[0];

    pc.connectionState = 'disconnected';
    pc.onconnectionstatechange?.();
    // Heals in time: nothing happens.
    await vi.advanceTimersByTimeAsync(WEBRTC_TIMING.DISCONNECT_GRACE_MS / 2);
    pc.connectionState = 'connected';
    pc.onconnectionstatechange?.();
    await vi.advanceTimersByTimeAsync(WEBRTC_TIMING.DISCONNECT_GRACE_MS);
    expect(transports.sockets).toHaveLength(1);

    // Lingers: reconnect.
    pc.connectionState = 'disconnected';
    pc.onconnectionstatechange?.();
    await vi.advanceTimersByTimeAsync(WEBRTC_TIMING.DISCONNECT_GRACE_MS + WEBRTC_TIMING.BASE_RECONNECT_DELAY_MS);
    expect(transports.sockets).toHaveLength(2);
  });

  it('does not reset the attempt counter on socket open, so accept-then-close backs off and gives up', async () => {
    webrtcManager.acquire(MID);
    await settle();
    let expectedDelay: number = WEBRTC_TIMING.BASE_RECONNECT_DELAY_MS;
    for (let attempt = 1; attempt <= WEBRTC_TIMING.MAX_RECONNECT_ATTEMPTS; attempt++) {
      const ws = transports.sockets[transports.sockets.length - 1];
      ws.onopen?.();
      ws.onclose?.();
      expect(webrtcManager.getSnapshot(MID).error).toContain(`(${attempt}/${WEBRTC_TIMING.MAX_RECONNECT_ATTEMPTS})`);
      // Not yet reconnected just before the backoff elapses…
      await vi.advanceTimersByTimeAsync(expectedDelay - 1);
      expect(transports.sockets).toHaveLength(attempt);
      await vi.advanceTimersByTimeAsync(1);
      expect(transports.sockets).toHaveLength(attempt + 1);
      expectedDelay = Math.min(expectedDelay * 2, WEBRTC_TIMING.MAX_RECONNECT_DELAY_MS);
    }
    const last = transports.sockets[transports.sockets.length - 1];
    last.onopen?.();
    last.onclose?.();
    expect(webrtcManager.getSnapshot(MID).state).toBe('failed');
    expect(webrtcManager.getSnapshot(MID).error).toMatch(/after max retries/);
  });

  it('forgets past failures once the peer connection has been stable for a while', async () => {
    webrtcManager.acquire(MID);
    await settle();
    transports.sockets[0].onopen?.();
    transports.sockets[0].onclose?.(); // attempt 1
    await vi.advanceTimersByTimeAsync(WEBRTC_TIMING.BASE_RECONNECT_DELAY_MS);
    openAndOffer(transports.sockets[1]);
    await settle();
    const pc = transports.pcs[0];
    pc.connectionState = 'connected';
    pc.onconnectionstatechange?.();
    await vi.advanceTimersByTimeAsync(WEBRTC_TIMING.STABLE_CONNECTED_MS);

    transports.sockets[1].onclose?.();
    expect(webrtcManager.getSnapshot(MID).error).toContain('(1/5)');
  });

  it('a ping with no pong inside the deadline drops the socket and reconnects', async () => {
    webrtcManager.acquire(MID);
    await settle();
    const ws = transports.sockets[0];
    ws.onopen?.();
    await vi.advanceTimersByTimeAsync(WEBRTC_TIMING.KEEPALIVE_INTERVAL_MS);
    expect(ws.sent.map((s) => JSON.parse(s).type)).toContain('ping');
    await vi.advanceTimersByTimeAsync(WEBRTC_TIMING.PONG_TIMEOUT_MS);
    expect(webrtcManager.getSnapshot(MID).error).toMatch(/Keepalive timeout/);
    await vi.advanceTimersByTimeAsync(WEBRTC_TIMING.BASE_RECONNECT_DELAY_MS);
    expect(transports.sockets).toHaveLength(2);
  });

  it('a pong inside the deadline keeps the socket', async () => {
    webrtcManager.acquire(MID);
    await settle();
    const ws = transports.sockets[0];
    ws.onopen?.();
    await vi.advanceTimersByTimeAsync(WEBRTC_TIMING.KEEPALIVE_INTERVAL_MS);
    ws.onmessage?.({ data: JSON.stringify({ type: 'pong' }) });
    await vi.advanceTimersByTimeAsync(WEBRTC_TIMING.PONG_TIMEOUT_MS + 10);
    expect(transports.sockets).toHaveLength(1);
    expect(webrtcManager.getSnapshot(MID).state).toBe('signaling');
  });
});
