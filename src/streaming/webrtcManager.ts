/**
 * Shared WebRTC stream manager.
 *
 * Owns the WebSocket + RTCPeerConnection for each monitor *outside* the React
 * tree, so a stream survives route navigation. Components subscribe to a
 * monitor's stream via `useWebRtcStream`; the underlying connection is
 * reference-counted and only torn down once no consumer remains AND a short
 * grace period elapses — so navigating console -> detail (release immediately
 * followed by acquire) never drops the stream.
 *
 * A WebRTC MediaStream can be attached to any number of <video> elements, so
 * each consumer attaches the shared stream to its own element.
 *
 * Reconnect policy: every transport loss — socket close, ICE `failed`, ICE
 * `disconnected` that does not heal within a grace period, a missed keepalive
 * pong, a failed `/start` — goes through `scheduleReconnect`, which backs off
 * exponentially (1 s → 16 s) for up to five attempts and then settles in
 * `failed`. The attempt counter is reset only after the peer connection has
 * stayed `connected` for a while, never on socket open, so a backend that
 * accepts the socket and then drops it cannot loop at 1 s forever.
 */
import { getWebRtcWebsocketUrl, startLiveStream } from '@/api/monitors';
import { useAuthStore } from '@/stores/auth';
import type {
  StreamConnectionState,
  WebRtcSignalMessage,
  WebRtcIceCandidate,
} from '@/types';

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export const WEBRTC_TIMING = {
  KEEPALIVE_INTERVAL_MS: 30_000,
  /** A ping with no pong inside this window means the socket is half-open. */
  PONG_TIMEOUT_MS: 10_000,
  MAX_RECONNECT_ATTEMPTS: 5,
  BASE_RECONNECT_DELAY_MS: 1_000,
  MAX_RECONNECT_DELAY_MS: 16_000,
  /** How long a session lingers after its last consumer unmounts, so navigating
   *  between two views of the same monitor doesn't drop the connection. */
  GRACE_PERIOD_MS: 8_000,
  /** ICE `disconnected` often heals on its own (Wi-Fi roam); wait this long. */
  DISCONNECT_GRACE_MS: 5_000,
  /** Connected this long → the link is stable → forget past failures. */
  STABLE_CONNECTED_MS: 30_000,
} as const;

export interface WebRtcSnapshot {
  state: StreamConnectionState;
  error: string | null;
  hasAudio: boolean;
  mediaStream: MediaStream | null;
}

const IDLE_SNAPSHOT: WebRtcSnapshot = {
  state: 'idle',
  error: null,
  hasAudio: false,
  mediaStream: null,
};

interface Session {
  monitorId: number;
  refCount: number;
  ws: WebSocket | null;
  pc: RTCPeerConnection | null;
  sessionId: string | null;
  keepaliveTimer: ReturnType<typeof setInterval> | null;
  pongTimer: ReturnType<typeof setTimeout> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  stableTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempt: number;
  graceTimer: ReturnType<typeof setTimeout> | null;
  /** Safari rejects addIceCandidate() before setRemoteDescription() resolves. */
  remoteReady: boolean;
  pendingCandidates: WebRtcIceCandidate[];
  /** Set during intentional teardown to suppress the reconnect path. */
  closing: boolean;
}

const sessions = new Map<number, Session>();
const snapshots = new Map<number, WebRtcSnapshot>();
const listeners = new Map<number, Set<() => void>>();

// --- snapshot store (drives useSyncExternalStore) ---------------------------

function getSnapshot(monitorId: number): WebRtcSnapshot {
  return snapshots.get(monitorId) ?? IDLE_SNAPSHOT;
}

function subscribe(monitorId: number, listener: () => void): () => void {
  let set = listeners.get(monitorId);
  if (!set) {
    set = new Set();
    listeners.set(monitorId, set);
  }
  set.add(listener);
  return () => {
    const current = listeners.get(monitorId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(monitorId);
  };
}

/**
 * Merge a patch into a monitor's snapshot and notify subscribers. A new
 * snapshot object is produced only here, keeping getSnapshot() referentially
 * stable between changes — a requirement of useSyncExternalStore.
 */
function patchSnapshot(monitorId: number, patch: Partial<WebRtcSnapshot>) {
  const prev = snapshots.get(monitorId) ?? IDLE_SNAPSHOT;
  snapshots.set(monitorId, { ...prev, ...patch });
  listeners.get(monitorId)?.forEach((listener) => listener());
}

// --- connection lifecycle ---------------------------------------------------

function clearTimer<T extends 'keepaliveTimer' | 'pongTimer' | 'reconnectTimer' | 'disconnectTimer' | 'stableTimer'>(
  session: Session,
  key: T,
) {
  const handle = session[key];
  if (handle == null) return;
  if (key === 'keepaliveTimer') clearInterval(handle as ReturnType<typeof setInterval>);
  else clearTimeout(handle as ReturnType<typeof setTimeout>);
  session[key] = null;
}

function clearTimers(session: Session) {
  clearTimer(session, 'keepaliveTimer');
  clearTimer(session, 'pongTimer');
  clearTimer(session, 'reconnectTimer');
  clearTimer(session, 'disconnectTimer');
  clearTimer(session, 'stableTimer');
}

/** Close the transport for a session but keep the Session record. */
function closeTransport(session: Session) {
  clearTimers(session);
  if (session.pc) {
    session.pc.onconnectionstatechange = null;
    session.pc.close();
    session.pc = null;
  }
  if (session.ws) {
    session.ws.onopen = null;
    session.ws.onmessage = null;
    session.ws.onerror = null;
    session.ws.onclose = null;
    session.ws.close();
    session.ws = null;
  }
  session.sessionId = null;
  session.remoteReady = false;
  session.pendingCandidates = [];
}

/**
 * Schedule a reconnect with exponential backoff, or give up after the cap.
 * Every transport-loss path funnels through here so they all retry the same
 * way. Idempotent while a retry is already pending.
 */
function scheduleReconnect(session: Session, reason: string) {
  const { monitorId } = session;
  if (session.closing) return;
  if (session.reconnectTimer) return;
  clearTimers(session);

  if (session.reconnectAttempt < WEBRTC_TIMING.MAX_RECONNECT_ATTEMPTS) {
    const delay = Math.min(
      WEBRTC_TIMING.BASE_RECONNECT_DELAY_MS * 2 ** session.reconnectAttempt,
      WEBRTC_TIMING.MAX_RECONNECT_DELAY_MS,
    );
    session.reconnectAttempt++;
    patchSnapshot(monitorId, {
      state: 'connecting',
      error: `${reason}, retrying (${session.reconnectAttempt}/${WEBRTC_TIMING.MAX_RECONNECT_ATTEMPTS})...`,
    });
    session.reconnectTimer = setTimeout(() => {
      session.reconnectTimer = null;
      void connect(session);
    }, delay);
  } else {
    closeTransport(session);
    patchSnapshot(monitorId, {
      state: 'failed',
      error: `${reason} after max retries`,
      mediaStream: null,
    });
  }
}

/** Drop a socket we consider dead and go straight to the retry path. */
function dropTransport(session: Session, reason: string) {
  if (session.ws) {
    session.ws.onclose = null;
    session.ws.close();
  }
  scheduleReconnect(session, reason);
}

async function connect(session: Session) {
  const { monitorId } = session;
  closeTransport(session);
  patchSnapshot(monitorId, { state: 'connecting', error: null });

  // Step 1 of the server-initiated signaling contract: enable the WebRTC track
  // on the backend. The response's `webrtc_signaling` is the authoritative WS
  // path; without this call the server has no track to offer over the socket.
  let signalingPath: string | undefined;
  try {
    const resp = await startLiveStream(monitorId, { enable_webrtc: true });
    signalingPath = resp.webrtc_signaling ?? undefined;
  } catch (err) {
    // A 401 that survived the client's refresh-and-retry means the session is
    // gone; anything else is a transient backend problem. Both back off.
    const message =
      err instanceof Error ? err.message : 'Failed to start WebRTC stream';
    scheduleReconnect(session, message);
    return;
  }

  // The session may have been torn down (logout / stopHard / grace expiry)
  // while the start request was in flight — bail without resurrecting it.
  if (session.closing || sessions.get(monitorId) !== session) return;

  const ws = new WebSocket(getWebRtcWebsocketUrl(monitorId, signalingPath));
  session.ws = ws;

  ws.onopen = () => {
    patchSnapshot(monitorId, { state: 'signaling' });
    // Deliberately no reconnectAttempt reset here — see the stable timer in
    // onconnectionstatechange.
    session.keepaliveTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'ping' }));
      if (!session.pongTimer) {
        session.pongTimer = setTimeout(() => {
          session.pongTimer = null;
          dropTransport(session, 'Keepalive timeout');
        }, WEBRTC_TIMING.PONG_TIMEOUT_MS);
      }
    }, WEBRTC_TIMING.KEEPALIVE_INTERVAL_MS);
  };

  ws.onmessage = async (event) => {
    let msg: WebRtcSignalMessage;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'offer': {
        session.sessionId = msg.session_id;

        const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
        session.pc = pc;

        pc.ontrack = (trackEvent) => {
          // streams[0] is normally populated (offer carries msid); fall back to
          // a fresh MediaStream so the consumer still gets the track.
          const stream =
            trackEvent.streams[0] ?? new MediaStream([trackEvent.track]);
          patchSnapshot(monitorId, {
            mediaStream: stream,
            hasAudio: stream.getAudioTracks().length > 0,
          });
        };

        pc.onicecandidate = (iceEvent) => {
          if (iceEvent.candidate && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'icecandidate',
                session_id: session.sessionId,
                candidate: iceEvent.candidate.candidate,
                sdpMid: iceEvent.candidate.sdpMid,
                sdpMLineIndex: iceEvent.candidate.sdpMLineIndex,
              }),
            );
          }
        };

        pc.onconnectionstatechange = () => {
          if (session.pc !== pc || session.closing) return;
          switch (pc.connectionState) {
            case 'connected':
              clearTimer(session, 'disconnectTimer');
              if (!session.stableTimer) {
                session.stableTimer = setTimeout(() => {
                  session.stableTimer = null;
                  session.reconnectAttempt = 0;
                }, WEBRTC_TIMING.STABLE_CONNECTED_MS);
              }
              break;
            case 'disconnected':
              // Usually transient; only treat it as a loss if it lingers.
              clearTimer(session, 'stableTimer');
              if (!session.disconnectTimer) {
                session.disconnectTimer = setTimeout(() => {
                  session.disconnectTimer = null;
                  dropTransport(session, 'Connection interrupted');
                }, WEBRTC_TIMING.DISCONNECT_GRACE_MS);
              }
              break;
            case 'failed':
              dropTransport(session, 'WebRTC connection failed');
              break;
            default:
              break;
          }
        };

        try {
          await pc.setRemoteDescription(
            new RTCSessionDescription({ type: 'offer', sdp: msg.sdp }),
          );

          // Remote description is set — flush ICE candidates buffered during
          // negotiation (Safari throws if they are added any earlier).
          session.remoteReady = true;
          for (const c of session.pendingCandidates) {
            try {
              await pc.addIceCandidate(
                new RTCIceCandidate({
                  candidate: c.candidate,
                  sdpMid: c.sdpMid,
                  sdpMLineIndex: c.sdpMLineIndex,
                }),
              );
            } catch {
              // Non-fatal
            }
          }
          session.pendingCandidates = [];

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'answer',
                session_id: msg.session_id,
                sdp: answer.sdp,
              }),
            );
          }
        } catch (err) {
          patchSnapshot(monitorId, {
            state: 'failed',
            error:
              err instanceof Error ? err.message : 'WebRTC negotiation failed',
          });
        }
        break;
      }

      case 'icecandidate': {
        // Buffer candidates that arrive before setRemoteDescription resolves —
        // Safari throws InvalidStateError if addIceCandidate runs too early.
        if (!session.remoteReady || !session.pc) {
          session.pendingCandidates.push(msg);
          break;
        }
        try {
          await session.pc.addIceCandidate(
            new RTCIceCandidate({
              candidate: msg.candidate,
              sdpMid: msg.sdpMid,
              sdpMLineIndex: msg.sdpMLineIndex,
            }),
          );
        } catch {
          // Non-fatal: candidate could be for an already-resolved path
        }
        break;
      }

      case 'ready':
        patchSnapshot(monitorId, { state: 'connected' });
        break;

      case 'error':
        patchSnapshot(monitorId, { state: 'failed', error: msg.message });
        break;

      case 'pong':
        clearTimer(session, 'pongTimer');
        break;
    }
  };

  ws.onerror = () => {
    // onerror is always followed by onclose — reconnect is handled there.
  };

  ws.onclose = () => {
    if (session.closing) return;
    scheduleReconnect(session, 'Connection lost');
  };
}

function teardown(monitorId: number) {
  const session = sessions.get(monitorId);
  if (!session) return;
  session.closing = true;
  if (session.graceTimer) {
    clearTimeout(session.graceTimer);
    session.graceTimer = null;
  }
  closeTransport(session);
  sessions.delete(monitorId);
  patchSnapshot(monitorId, {
    state: 'idle',
    error: null,
    hasAudio: false,
    mediaStream: null,
  });
}

// --- public API -------------------------------------------------------------

/** Register a consumer for a monitor's stream, starting it if not already running. */
function acquire(monitorId: number) {
  const existing = sessions.get(monitorId);
  if (existing) {
    existing.refCount++;
    if (existing.graceTimer) {
      clearTimeout(existing.graceTimer);
      existing.graceTimer = null;
    }
    return;
  }
  const session: Session = {
    monitorId,
    refCount: 1,
    ws: null,
    pc: null,
    sessionId: null,
    keepaliveTimer: null,
    pongTimer: null,
    reconnectTimer: null,
    disconnectTimer: null,
    stableTimer: null,
    reconnectAttempt: 0,
    graceTimer: null,
    remoteReady: false,
    pendingCandidates: [],
    closing: false,
  };
  sessions.set(monitorId, session);
  void connect(session);
}

/** Drop a consumer's reference; tears down after a grace period at zero refs. */
function release(monitorId: number) {
  const session = sessions.get(monitorId);
  if (!session) return;
  session.refCount = Math.max(0, session.refCount - 1);
  if (session.refCount === 0 && !session.graceTimer) {
    session.graceTimer = setTimeout(() => teardown(monitorId), WEBRTC_TIMING.GRACE_PERIOD_MS);
  }
}

/** Immediately tear down a monitor's stream regardless of reference count. */
function stopHard(monitorId: number) {
  teardown(monitorId);
}

/** Tear down every active stream (used on logout). */
function shutdownAll() {
  for (const monitorId of [...sessions.keys()]) {
    teardown(monitorId);
  }
}

/** Whether a live session record exists for the monitor (any state but idle). */
function hasSession(monitorId: number): boolean {
  return sessions.has(monitorId);
}

// Drop all connections on logout so they don't leak across user sessions.
useAuthStore.subscribe((state, prevState) => {
  if (prevState.isAuthenticated && !state.isAuthenticated) {
    shutdownAll();
  }
});

export const webrtcManager = {
  acquire,
  release,
  stopHard,
  subscribe,
  getSnapshot,
  hasSession,
};
