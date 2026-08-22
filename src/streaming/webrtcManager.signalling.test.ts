/**
 * Signalling-path tests for the shared WebRTC manager.
 *
 * `webrtcManager.test.ts` covers ref-counting and the reconnect *policy*; this
 * file drives the message pump itself — offer/answer, ICE in both directions,
 * `ready`/`error`/`pong`, the candidate buffer that keeps Safari happy, and the
 * `?token=` contract on the signalling socket. The fakes here actually deliver
 * messages and resolve their promises, so the async body of `ws.onmessage` runs
 * end to end rather than being short-circuited by a stub.
 */
import { describe, expect, it, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/stores/auth';

const { startLiveStream } = vi.hoisted(() => ({ startLiveStream: vi.fn() }));

// Only `startLiveStream` is stubbed — `getWebRtcWebsocketUrl` stays real so the
// token-in-query contract is exercised against the shipping implementation.
vi.mock('@/api/monitors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/monitors')>()),
  startLiveStream,
}));

const { WEBRTC_TIMING, webrtcManager } = await import('./webrtcManager');

/* -------------------------------------------------------------------------- */
/*  Fake transports                                                            */
/* -------------------------------------------------------------------------- */

interface FakeSocket {
  url: string;
  readyState: number;
  sent: string[];
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  /** Deliver a signalling frame the way the server would. */
  deliver(msg: unknown): void;
  /** Frames this socket sent back, parsed. */
  outbound(): Array<Record<string, unknown>>;
}

interface FakePeer {
  connectionState: RTCPeerConnectionState;
  onconnectionstatechange: (() => void) | null;
  ontrack: ((e: unknown) => void) | null;
  onicecandidate: ((e: unknown) => void) | null;
  remoteDescriptions: unknown[];
  addedCandidates: unknown[];
  closed: boolean;
  /** Set to make setRemoteDescription reject (negotiation-failure path). */
  failRemoteDescription: boolean;
  /** Set to make addIceCandidate reject (the swallowed, non-fatal path). */
  failAddIceCandidate: boolean;
}

interface Transports {
  sockets: FakeSocket[];
  peers: FakePeer[];
  /** Options applied to the NEXT peer connection the manager builds. */
  nextPeer: { failRemoteDescription: boolean; failAddIceCandidate: boolean };
  restore(): void;
}

function installTransports(): Transports {
  const sockets: FakeSocket[] = [];
  const peers: FakePeer[] = [];
  const nextPeer = { failRemoteDescription: false, failAddIceCandidate: false };

  // MSW's WebSocket interceptor redefines `globalThis.WebSocket` as a
  // non-writable property, so plain assignment throws. Swap the descriptors.
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const install = (name: string, value: unknown) => {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      value, writable: true, configurable: true, enumerable: true,
    });
  };

  class Socket implements FakeSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readyState = 1;
    sent: string[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    url: string;
    constructor(url: string) { this.url = url; sockets.push(this); }
    send(data: string) { this.sent.push(data); }
    close() { this.readyState = 3; }
    deliver(msg: unknown) { this.onmessage?.({ data: JSON.stringify(msg) }); }
    outbound() { return this.sent.map((s) => JSON.parse(s) as Record<string, unknown>); }
  }

  class Peer implements FakePeer {
    connectionState: RTCPeerConnectionState = 'new';
    onconnectionstatechange: (() => void) | null = null;
    ontrack: ((e: unknown) => void) | null = null;
    onicecandidate: ((e: unknown) => void) | null = null;
    remoteDescriptions: unknown[] = [];
    addedCandidates: unknown[] = [];
    closed = false;
    failRemoteDescription = nextPeer.failRemoteDescription;
    failAddIceCandidate = nextPeer.failAddIceCandidate;
    constructor() { peers.push(this); }
    async setRemoteDescription(desc: unknown) {
      if (this.failRemoteDescription) throw new Error('SDP rejected by peer');
      this.remoteDescriptions.push(desc);
    }
    async setLocalDescription() {}
    async createAnswer() { return { type: 'answer' as const, sdp: 'v=0\r\na=answer' }; }
    async addIceCandidate(c: unknown) {
      if (this.failAddIceCandidate) throw new Error('InvalidStateError');
      this.addedCandidates.push(c);
    }
    close() { this.closed = true; }
  }

  class Description { init: unknown; constructor(init: unknown) { this.init = init; } }
  class Candidate { init: unknown; constructor(init: unknown) { this.init = init; } }
  class Stream {
    tracks: unknown[];
    constructor(tracks: unknown[] = []) { this.tracks = tracks; }
    getAudioTracks() { return this.tracks.filter((t) => (t as { kind?: string }).kind === 'audio'); }
  }

  install('WebSocket', Socket);
  install('RTCPeerConnection', Peer);
  install('RTCSessionDescription', Description);
  install('RTCIceCandidate', Candidate);
  install('MediaStream', Stream);

  return {
    sockets,
    peers,
    nextPeer,
    restore() {
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete (globalThis as Record<string, unknown>)[name];
      }
      saved.clear();
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Harness                                                                    */
/* -------------------------------------------------------------------------- */

/** Counts any DELETE of the shared backend session — must stay at zero. */
let stopHits = 0;
const server = setupServer(
  http.delete('/api/v3/live/:id/stop', () => {
    stopHits += 1;
    return new HttpResponse(null, { status: 204 });
  }),
);

const TOKEN = 'header.payload-with_base64url-chars.signature';

let transports: Transports;
let nextMonitorId = 991_000;
let MID: number;

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

beforeEach(() => {
  MID = ++nextMonitorId;
  stopHits = 0;
  vi.useFakeTimers();
  transports = installTransports();
  startLiveStream.mockImplementation(async (monitorId: number) => ({
    monitor_id: monitorId,
    status: 'started',
    webrtc_signaling: `/api/v3/live/${monitorId}/webrtc/ws`,
  }));
  useAuthStore.setState({
    accessToken: TOKEN, refreshToken: 'r', user: null, isAuthenticated: true,
  });
});

afterEach(() => {
  webrtcManager.stopHard(MID);
  transports.restore();
  vi.useRealTimers();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

/** Let `connect()` clear the awaited `/start` and open its socket. */
async function settle() {
  await vi.advanceTimersByTimeAsync(0);
}

/** Acquire, drain the start call, and hand back the socket that opened. */
async function connectAndOpen(): Promise<FakeSocket> {
  webrtcManager.acquire(MID);
  await settle();
  const ws = transports.sockets[transports.sockets.length - 1];
  ws.onopen?.();
  return ws;
}

const OFFER = { type: 'offer', session_id: 'sess-42', sdp: 'v=0\r\na=offer' };

/* -------------------------------------------------------------------------- */

describe('webrtcManager — signalling handshake', () => {
  it('answers the offer over the socket, relays local ICE, and reports connected', async () => {
    const ws = await connectAndOpen();
    expect(webrtcManager.getSnapshot(MID).state).toBe('signaling');

    ws.deliver(OFFER);
    await settle();

    // The offer SDP reached the peer connection…
    const pc = transports.peers[0];
    expect(pc.remoteDescriptions).toHaveLength(1);

    // …and the answer went back on the same socket, tagged with the session id.
    const answer = ws.outbound().find((m) => m.type === 'answer');
    expect(answer).toMatchObject({ type: 'answer', session_id: 'sess-42', sdp: 'v=0\r\na=answer' });

    // A remote candidate is applied now that the remote description is set.
    ws.deliver({
      type: 'icecandidate', candidate: 'candidate:remote 1 udp', sdpMid: '0', sdpMLineIndex: 0,
    });
    await settle();
    expect(pc.addedCandidates).toHaveLength(1);

    // A locally gathered candidate is forwarded to the server.
    pc.onicecandidate?.({
      candidate: { candidate: 'candidate:local 1 udp', sdpMid: '0', sdpMLineIndex: 0 },
    });
    const outboundIce = ws.outbound().find((m) => m.type === 'icecandidate');
    expect(outboundIce).toMatchObject({
      type: 'icecandidate',
      session_id: 'sess-42',
      candidate: 'candidate:local 1 udp',
      sdpMid: '0',
      sdpMLineIndex: 0,
    });

    // The server's `ready` frame is what flips the public state to connected.
    ws.deliver({ type: 'ready' });
    expect(webrtcManager.getSnapshot(MID).state).toBe('connected');
  });

  it('publishes the remote track and its audio flag via ontrack', async () => {
    const ws = await connectAndOpen();
    ws.deliver(OFFER);
    await settle();

    const pc = transports.peers[0];
    const audio = { kind: 'audio' };
    const stream = { getAudioTracks: () => [audio] };
    pc.ontrack?.({ streams: [stream], track: { kind: 'video' } });

    const snap = webrtcManager.getSnapshot(MID);
    expect(snap.mediaStream).toBe(stream as unknown as MediaStream);
    expect(snap.hasAudio).toBe(true);
  });

  it('falls back to a fresh MediaStream when the track event carries no stream', async () => {
    const ws = await connectAndOpen();
    ws.deliver(OFFER);
    await settle();

    const pc = transports.peers[0];
    pc.ontrack?.({ streams: [], track: { kind: 'video' } });

    const snap = webrtcManager.getSnapshot(MID);
    expect(snap.mediaStream).not.toBeNull();
    expect(snap.hasAudio).toBe(false);
  });

  it('drops a local candidate when the socket is no longer open', async () => {
    const ws = await connectAndOpen();
    ws.deliver(OFFER);
    await settle();
    const pc = transports.peers[0];

    ws.readyState = 3; // CLOSED
    pc.onicecandidate?.({ candidate: { candidate: 'c', sdpMid: '0', sdpMLineIndex: 0 } });
    expect(ws.outbound().some((m) => m.type === 'icecandidate')).toBe(false);

    // The end-of-gathering event (null candidate) is a no-op too.
    ws.readyState = 1;
    pc.onicecandidate?.({ candidate: null });
    expect(ws.outbound().some((m) => m.type === 'icecandidate')).toBe(false);
  });
});

describe('webrtcManager — candidate buffering', () => {
  it('buffers candidates that arrive before the offer and flushes them after setRemoteDescription', async () => {
    const ws = await connectAndOpen();

    // Two candidates land before any offer — nothing to apply them to yet.
    ws.deliver({ type: 'icecandidate', candidate: 'early-1', sdpMid: '0', sdpMLineIndex: 0 });
    ws.deliver({ type: 'icecandidate', candidate: 'early-2', sdpMid: '0', sdpMLineIndex: 0 });
    await settle();
    expect(transports.peers).toHaveLength(0);

    ws.deliver(OFFER);
    await settle();

    // Both were replayed onto the peer connection once the remote SDP was set.
    expect(transports.peers[0].addedCandidates).toHaveLength(2);

    // The buffer is emptied, so a later offer does not double-apply them.
    ws.deliver({ ...OFFER, session_id: 'sess-43' });
    await settle();
    expect(transports.peers[1].addedCandidates).toHaveLength(0);
  });

  it('swallows a rejected addIceCandidate instead of failing the stream', async () => {
    transports.nextPeer.failAddIceCandidate = true;
    const ws = await connectAndOpen();
    ws.deliver({ type: 'icecandidate', candidate: 'early', sdpMid: '0', sdpMLineIndex: 0 });
    await settle();
    ws.deliver(OFFER);
    await settle();
    // Buffered candidate rejected during the flush…
    expect(transports.peers[0].addedCandidates).toHaveLength(0);

    // …and a live one rejected after negotiation. Neither is fatal.
    ws.deliver({ type: 'icecandidate', candidate: 'live', sdpMid: '0', sdpMLineIndex: 0 });
    await settle();
    expect(webrtcManager.getSnapshot(MID).state).not.toBe('failed');
    expect(ws.outbound().some((m) => m.type === 'answer')).toBe(true);
  });
});

describe('webrtcManager — server-reported problems', () => {
  it('surfaces a failed negotiation without tearing the session down', async () => {
    transports.nextPeer.failRemoteDescription = true;
    const ws = await connectAndOpen();
    ws.deliver(OFFER);
    await settle();

    const snap = webrtcManager.getSnapshot(MID);
    expect(snap.state).toBe('failed');
    expect(snap.error).toBe('SDP rejected by peer');
    expect(ws.outbound().some((m) => m.type === 'answer')).toBe(false);
  });

  it('surfaces an `error` frame from the server', async () => {
    const ws = await connectAndOpen();
    ws.deliver({ type: 'error', message: 'monitor is not capturing' });

    const snap = webrtcManager.getSnapshot(MID);
    expect(snap.state).toBe('failed');
    expect(snap.error).toBe('monitor is not capturing');
  });

  it('ignores a frame that is not JSON', async () => {
    const ws = await connectAndOpen();
    ws.onmessage?.({ data: '<html>502 Bad Gateway</html>' });
    await settle();
    expect(webrtcManager.getSnapshot(MID).state).toBe('signaling');
  });

  it('backs off when POST /start rejects, reporting the backend message', async () => {
    startLiveStream.mockRejectedValueOnce(new Error('monitor 7 has no source'));
    webrtcManager.acquire(MID);
    await settle();

    const snap = webrtcManager.getSnapshot(MID);
    expect(snap.state).toBe('connecting');
    expect(snap.error).toMatch(/monitor 7 has no source, retrying \(1\/5\)/);
    expect(transports.sockets).toHaveLength(0);

    // The scheduled retry does open a socket.
    await vi.advanceTimersByTimeAsync(WEBRTC_TIMING.BASE_RECONNECT_DELAY_MS);
    expect(transports.sockets).toHaveLength(1);
  });

  it('reports a generic message when /start rejects with a non-Error', async () => {
    startLiveStream.mockRejectedValueOnce('kaboom');
    webrtcManager.acquire(MID);
    await settle();
    expect(webrtcManager.getSnapshot(MID).error).toMatch(/^Failed to start WebRTC stream, retrying/);
  });

  it('does not resurrect a session torn down while /start was in flight', async () => {
    let release!: (v: unknown) => void;
    startLiveStream.mockImplementationOnce(() => new Promise((res) => { release = res; }));
    webrtcManager.acquire(MID);
    await settle();

    webrtcManager.stopHard(MID);
    release({ monitor_id: MID, status: 'started', webrtc_signaling: '/x' });
    await settle();

    expect(transports.sockets).toHaveLength(0);
    expect(webrtcManager.getSnapshot(MID).state).toBe('idle');
  });
});

describe('webrtcManager — connection state transitions', () => {
  it('ignores states other than connected/disconnected/failed', async () => {
    const ws = await connectAndOpen();
    ws.deliver(OFFER);
    await settle();
    const pc = transports.peers[0];

    pc.connectionState = 'connecting';
    pc.onconnectionstatechange?.();
    pc.connectionState = 'new';
    pc.onconnectionstatechange?.();

    await vi.advanceTimersByTimeAsync(WEBRTC_TIMING.DISCONNECT_GRACE_MS * 2);
    expect(transports.sockets).toHaveLength(1);
    expect(webrtcManager.getSnapshot(MID).state).toBe('signaling');
  });

  it('ignores state changes from a peer connection the session has replaced', async () => {
    const ws = await connectAndOpen();
    ws.deliver(OFFER);
    await settle();
    const stale = transports.peers[0];

    ws.deliver({ ...OFFER, session_id: 'sess-99' });
    await settle();
    expect(transports.peers).toHaveLength(2);

    stale.connectionState = 'failed';
    stale.onconnectionstatechange?.();

    // No reconnect was scheduled off the orphaned peer connection.
    await vi.advanceTimersByTimeAsync(WEBRTC_TIMING.BASE_RECONNECT_DELAY_MS * 2);
    expect(transports.sockets).toHaveLength(1);
  });
});

describe('webrtcManager — keepalive', () => {
  it('clears the pong deadline when the server answers', async () => {
    const ws = await connectAndOpen();
    await vi.advanceTimersByTimeAsync(WEBRTC_TIMING.KEEPALIVE_INTERVAL_MS);
    expect(ws.outbound().filter((m) => m.type === 'ping')).toHaveLength(1);

    ws.deliver({ type: 'pong' });
    await vi.advanceTimersByTimeAsync(WEBRTC_TIMING.PONG_TIMEOUT_MS * 2);
    expect(webrtcManager.getSnapshot(MID).state).toBe('signaling');

    // A second interval pings again on the same, still-healthy socket.
    await vi.advanceTimersByTimeAsync(
      WEBRTC_TIMING.KEEPALIVE_INTERVAL_MS - WEBRTC_TIMING.PONG_TIMEOUT_MS * 2,
    );
    expect(ws.outbound().filter((m) => m.type === 'ping')).toHaveLength(2);
    ws.deliver({ type: 'pong' });
    await vi.advanceTimersByTimeAsync(WEBRTC_TIMING.PONG_TIMEOUT_MS);
    expect(transports.sockets).toHaveLength(1);
  });

  it('skips the ping when the socket is not open', async () => {
    const ws = await connectAndOpen();
    ws.readyState = 3;
    await vi.advanceTimersByTimeAsync(WEBRTC_TIMING.KEEPALIVE_INTERVAL_MS + WEBRTC_TIMING.PONG_TIMEOUT_MS);
    expect(ws.outbound()).toHaveLength(0);
    expect(transports.sockets).toHaveLength(1);
  });
});

describe('webrtcManager — socket URL carries the JWT', () => {
  it('passes the token raw in ?token= (never percent-encoded)', async () => {
    const ws = await connectAndOpen();
    expect(ws.url).toBe(`ws://localhost:3000/api/v3/live/${MID}/webrtc/ws?token=${TOKEN}`);
    expect(ws.url).not.toContain('%');
  });

  it('omits the query entirely when there is no token', async () => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null, isAuthenticated: true });
    const ws = await connectAndOpen();
    expect(ws.url).not.toContain('token=');
  });
});

describe('webrtcManager — teardown never stops the shared backend session', () => {
  it('stopHard() closes the transport without DELETE /live/{id}/stop', async () => {
    const ws = await connectAndOpen();
    ws.deliver(OFFER);
    await settle();
    ws.deliver({ type: 'ready' });
    expect(webrtcManager.hasSession(MID)).toBe(true);

    webrtcManager.stopHard(MID);
    await vi.advanceTimersByTimeAsync(100);

    expect(stopHits).toBe(0);
    expect(ws.readyState).toBe(3);
    expect(transports.peers[0].closed).toBe(true);
    expect(webrtcManager.hasSession(MID)).toBe(false);
    expect(webrtcManager.getSnapshot(MID).state).toBe('idle');
  });

  it('grace-period teardown after the last release makes no DELETE either', async () => {
    await connectAndOpen();
    webrtcManager.release(MID);
    await vi.advanceTimersByTimeAsync(WEBRTC_TIMING.GRACE_PERIOD_MS + 10);
    expect(webrtcManager.hasSession(MID)).toBe(false);
    expect(stopHits).toBe(0);
  });

  it('logging out shuts every live session down', async () => {
    await connectAndOpen();
    const other = ++nextMonitorId;
    webrtcManager.acquire(other);
    await settle();
    expect(webrtcManager.hasSession(MID)).toBe(true);
    expect(webrtcManager.hasSession(other)).toBe(true);

    useAuthStore.getState().clearAuth();

    expect(webrtcManager.hasSession(MID)).toBe(false);
    expect(webrtcManager.hasSession(other)).toBe(false);
    expect(stopHits).toBe(0);
  });
});
