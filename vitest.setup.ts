// i18n: tests run with English keys and no catalogue (t(key) === key).
import './src/i18n';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

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
