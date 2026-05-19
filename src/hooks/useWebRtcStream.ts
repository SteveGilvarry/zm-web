import { useState, useRef, useCallback, useEffect } from 'react';
import { getWebRtcWebsocketUrl } from '@/api/monitors';
import type { StreamConnectionState, WebRtcSignalMessage } from '@/types';

export interface StreamHookResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  state: StreamConnectionState;
  error: string | null;
  start: () => void;
  stop: () => void;
  hasAudio: boolean;
}

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const KEEPALIVE_INTERVAL_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 1000;

export function useWebRtcStream(monitorId: number): StreamHookResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const intentionalStopRef = useRef(false);
  // Safari throws InvalidStateError if addIceCandidate() runs before
  // setRemoteDescription() resolves — buffer early candidates and flush them.
  const remoteReadyRef = useRef(false);
  const pendingCandidatesRef = useRef<WebRtcSignalMessage[]>([]);

  const [state, setState] = useState<StreamConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hasAudio, setHasAudio] = useState(false);

  const cleanup = useCallback(() => {
    if (keepaliveRef.current) {
      clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    sessionIdRef.current = null;
    setHasAudio(false);
  }, []);

  const stop = useCallback(() => {
    intentionalStopRef.current = true;
    cleanup();
    setState('idle');
    setError(null);
    reconnectAttemptRef.current = 0;
  }, [cleanup]);

  const connect = useCallback(() => {
    cleanup();
    setError(null);
    setState('connecting');
    intentionalStopRef.current = false;
    remoteReadyRef.current = false;
    pendingCandidatesRef.current = [];

    const wsUrl = getWebRtcWebsocketUrl(monitorId);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setState('signaling');
      reconnectAttemptRef.current = 0;

      // Start keepalive
      keepaliveRef.current = setInterval(() => {
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
          sessionIdRef.current = msg.session_id;

          const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
          pcRef.current = pc;

          // Handle incoming tracks
          pc.ontrack = (trackEvent) => {
            if (videoRef.current && trackEvent.streams[0]) {
              videoRef.current.srcObject = trackEvent.streams[0];
              videoRef.current.play().catch(() => {});

              // Check for audio tracks
              const audioTracks = trackEvent.streams[0].getAudioTracks();
              if (audioTracks.length > 0) {
                setHasAudio(true);
              }
            }
          };

          // Send ICE candidates to server
          pc.onicecandidate = (iceEvent) => {
            if (iceEvent.candidate && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'icecandidate',
                session_id: sessionIdRef.current,
                candidate: iceEvent.candidate.candidate,
                sdpMid: iceEvent.candidate.sdpMid,
                sdpMLineIndex: iceEvent.candidate.sdpMLineIndex,
              }));
            }
          };

          pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed') {
              setState('failed');
              setError('WebRTC connection failed');
            }
          };

          try {
            await pc.setRemoteDescription(new RTCSessionDescription({
              type: 'offer',
              sdp: msg.sdp,
            }));

            // Remote description is set — safe to add ICE candidates now.
            // Flush any that arrived during negotiation (Safari would have
            // thrown if we'd added them earlier).
            remoteReadyRef.current = true;
            for (const c of pendingCandidatesRef.current) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate({
                  candidate: c.candidate,
                  sdpMid: c.sdpMid,
                  sdpMLineIndex: c.sdpMLineIndex,
                }));
              } catch {
                // Non-fatal
              }
            }
            pendingCandidatesRef.current = [];

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'answer',
                session_id: msg.session_id,
                sdp: answer.sdp,
              }));
            }
          } catch (err) {
            setState('failed');
            setError(err instanceof Error ? err.message : 'WebRTC negotiation failed');
          }
          break;
        }

        case 'icecandidate': {
          // Buffer candidates that arrive before setRemoteDescription has
          // resolved — Safari throws InvalidStateError if added too early.
          if (!remoteReadyRef.current || !pcRef.current) {
            pendingCandidatesRef.current.push(msg);
            break;
          }
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate({
              candidate: msg.candidate,
              sdpMid: msg.sdpMid,
              sdpMLineIndex: msg.sdpMLineIndex,
            }));
          } catch {
            // Non-fatal: ICE candidate could be for an already-resolved path
          }
          break;
        }

        case 'ready': {
          setState('connected');
          break;
        }

        case 'error': {
          setState('failed');
          setError(msg.message);
          break;
        }

        case 'pong':
          // Keepalive response, nothing to do
          break;
      }
    };

    ws.onerror = () => {
      // onerror is always followed by onclose, handle reconnect there
    };

    ws.onclose = () => {
      if (intentionalStopRef.current) return;

      // Attempt reconnection with exponential backoff
      if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(
          BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttemptRef.current),
          16_000,
        );
        reconnectAttemptRef.current++;
        setState('connecting');
        setError(`Connection lost, retrying (${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS})...`);

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else {
        setState('failed');
        setError('Connection lost after max retries');
      }
    };
  }, [monitorId, cleanup]);

  const start = useCallback(() => {
    if (state === 'connecting' || state === 'signaling') return;
    reconnectAttemptRef.current = 0;
    connect();
  }, [state, connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      intentionalStopRef.current = true;
      cleanup();
    };
  }, [cleanup]);

  return { videoRef, state, error, start, stop, hasAudio };
}
