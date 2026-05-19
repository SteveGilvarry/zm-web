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
 */
import { getWebRtcWebsocketUrl } from '@/api/monitors';
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

const KEEPALIVE_INTERVAL_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 16_000;
/** How long a session lingers after its last consumer unmounts, so navigating
 *  between two views of the same monitor doesn't drop the connection. */
const GRACE_PERIOD_MS = 8_000;

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
  reconnectTimer: ReturnType<typeof setTimeout> | null;
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

function clearTimers(session: Session) {
  if (session.keepaliveTimer) {
    clearInterval(session.keepaliveTimer);
    session.keepaliveTimer = null;
  }
  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }
}

/** Close the transport for a session but keep the Session record. */
function closeTransport(session: Session) {
  clearTimers(session);
  if (session.pc) {
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

function connect(session: Session) {
  const { monitorId } = session;
  closeTransport(session);
  patchSnapshot(monitorId, { state: 'connecting', error: null });

  const ws = new WebSocket(getWebRtcWebsocketUrl(monitorId));
  session.ws = ws;

  ws.onopen = () => {
    patchSnapshot(monitorId, { state: 'signaling' });
    session.reconnectAttempt = 0;
    session.keepaliveTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, KEEPALIVE_INTERVAL_MS);
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
          if (pc.connectionState === 'failed') {
            patchSnapshot(monitorId, {
              state: 'failed',
              error: 'WebRTC connection failed',
            });
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
        // Keepalive response, nothing to do
        break;
    }
  };

  ws.onerror = () => {
    // onerror is always followed by onclose — reconnect is handled there.
  };

  ws.onclose = () => {
    if (session.closing) return;
    clearTimers(session);

    if (session.reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * 2 ** session.reconnectAttempt,
        MAX_RECONNECT_DELAY_MS,
      );
      session.reconnectAttempt++;
      patchSnapshot(monitorId, {
        state: 'connecting',
        error: `Connection lost, retrying (${session.reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS})...`,
      });
      session.reconnectTimer = setTimeout(() => connect(session), delay);
    } else {
      patchSnapshot(monitorId, {
        state: 'failed',
        error: 'Connection lost after max retries',
      });
    }
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
    reconnectTimer: null,
    reconnectAttempt: 0,
    graceTimer: null,
    remoteReady: false,
    pendingCandidates: [],
    closing: false,
  };
  sessions.set(monitorId, session);
  connect(session);
}

/** Drop a consumer's reference; tears down after a grace period at zero refs. */
function release(monitorId: number) {
  const session = sessions.get(monitorId);
  if (!session) return;
  session.refCount = Math.max(0, session.refCount - 1);
  if (session.refCount === 0 && !session.graceTimer) {
    session.graceTimer = setTimeout(() => teardown(monitorId), GRACE_PERIOD_MS);
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
};
