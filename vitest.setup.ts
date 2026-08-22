// i18n: tests run with English keys and no catalogue (t(key) === key).
import './src/i18n';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

/**
 * testing-library waits 1 s by default for `findBy*` and `waitFor`. That is
 * generous on a laptop and marginal on a two-core CI runner: a route-level
 * test mounts the real router, MSW and a lazy page chunk before it can assert
 * anything, and two different tests have now failed on GitHub while passing
 * locally — the watch snapshot download, and the events list's first row.
 *
 * This changes patience, not assertions: a genuine failure still fails, it
 * just takes longer to say so. Individual tests can still pass their own
 * timeout where they need more.
 */
configure({ asyncUtilTimeout: 5_000 });

// React Testing Library unmounts and cleans up between tests so DOM
// state and event listeners don't bleed across.
afterEach(() => {
  cleanup();
});

// jsdom lacks IntersectionObserver + ResizeObserver. Both are used by
// MonitorPreview / StreamCell / the justified-row grid for visibility +
// container-size detection. Stub them so component tests can mount these
// components without crashing.
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
}
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error — overwrite to add the polyfill.
globalThis.IntersectionObserver ??= MockIntersectionObserver;
// @ts-expect-error — same.
globalThis.ResizeObserver ??= MockResizeObserver;

// jsdom doesn't ship WebSocket or RTCPeerConnection. Both are needed by
// the WebRTC stream manager; tests only need their constructors to not
// throw — they don't actually exchange signaling messages.
class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  send() {}
  close() { this.readyState = MockWebSocket.CLOSED; }
}
class MockRTCPeerConnection {
  ontrack: ((e: unknown) => void) | null = null;
  onicecandidate: ((e: unknown) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  iceConnectionState = 'new';
  async setRemoteDescription() {}
  async setLocalDescription() {}
  async createAnswer() { return { sdp: '', type: 'answer' as const }; }
  async addIceCandidate() {}
  close() {}
}
// @ts-expect-error — overwrite to add the polyfill.
globalThis.WebSocket ??= MockWebSocket;
// @ts-expect-error — same.
globalThis.RTCPeerConnection ??= MockRTCPeerConnection;
