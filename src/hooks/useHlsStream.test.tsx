import { describe, expect, it, vi, beforeAll, afterEach, afterAll } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/stores/auth';

/**
 * useHlsStream wraps hls.js + the `/api/v3/live/{id}/start` lifecycle.
 *
 * Strategy:
 *  - Mock `hls.js` with a controllable mock instance whose `on()` captures
 *    event handlers we then invoke synchronously to simulate MANIFEST_PARSED
 *    / ERROR.
 *  - MSW serves `/api/v3/live/{id}/start` + `/stop` so `startLiveStream`
 *    resolves and the hook proceeds into the hls.js path.
 *  - We use real timers (MSW + fake timers don't compose) and rely on
 *    `waitFor` for the 2 s loadSource delay in the hook.
 */

// --- hls.js mock ------------------------------------------------------------
// All state lives inside the factory and is exposed back via a module-level
// `__instances` getter so vi.mock's hoisting can't break the reference.

vi.mock('hls.js', () => {
  type HlsEvent = string;
  type HlsHandler = (event: HlsEvent, data: unknown) => void;
  const instances: Array<{
    loadSource: ReturnType<typeof vi.fn>;
    attachMedia: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    startLoad: ReturnType<typeof vi.fn>;
    recoverMediaError: ReturnType<typeof vi.fn>;
    swapAudioCodec: ReturnType<typeof vi.fn>;
    on: (event: HlsEvent, cb: HlsHandler) => void;
    fire: (event: HlsEvent, data?: unknown) => void;
  }> = [];

  function HlsCtor() {
    const handlers = new Map<HlsEvent, HlsHandler>();
    const inst = {
      loadSource: vi.fn(),
      attachMedia: vi.fn(),
      destroy: vi.fn(),
      startLoad: vi.fn(),
      recoverMediaError: vi.fn(),
      swapAudioCodec: vi.fn(),
      on: (event: HlsEvent, cb: HlsHandler) => { handlers.set(event, cb); },
      fire: (event: HlsEvent, data?: unknown) => {
        const cb = handlers.get(event);
        if (cb) cb(event, data);
      },
    };
    instances.push(inst);
    return inst;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HlsCtor as any).isSupported = () => true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HlsCtor as any).Events = {
    MANIFEST_PARSED: 'hlsManifestParsed',
    ERROR: 'hlsError',
    FRAG_BUFFERED: 'hlsFragBuffered',
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HlsCtor as any).ErrorTypes = {
    NETWORK_ERROR: 'networkError',
    MEDIA_ERROR: 'mediaError',
    OTHER_ERROR: 'otherError',
  };

  return {
    default: HlsCtor,
    __instances: instances,
    __reset: () => { instances.length = 0; },
  };
});

// Import the hook AFTER vi.mock so the mocked hls.js wins.
import { useHlsStream } from './useHlsStream';

// Pull __instances + __reset off the mocked module namespace.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hlsModuleNs = (await import('hls.js')) as any;
const instances: Array<{
  loadSource: ReturnType<typeof vi.fn>;
  attachMedia: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  startLoad: ReturnType<typeof vi.fn>;
  recoverMediaError: ReturnType<typeof vi.fn>;
  swapAudioCodec: ReturnType<typeof vi.fn>;
  on: (event: string, cb: (event: string, data: unknown) => void) => void;
  fire: (event: string, data?: unknown) => void;
}> = hlsModuleNs.__instances;
const resetInstances: () => void = hlsModuleNs.__reset;

// --- MSW for the start/stop endpoints --------------------------------------

const server = setupServer(
  http.post('/api/v3/live/:id/start', () =>
    HttpResponse.json({ session_id: 'sess-1', hls_url: 'unused' }),
  ),
  http.delete('/api/v3/live/:id/stop', () => new HttpResponse(null, { status: 204 })),
);

beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'warn' });
});

afterEach(() => {
  server.resetHandlers();
  resetInstances();
});

afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

// Attach a real <video> element with a stubbed .play() so the MANIFEST_PARSED
// handler in the hook doesn't crash on jsdom's missing HTMLMediaElement.play.
function attachVideo(ref: React.RefObject<HTMLVideoElement | null>) {
  const video = document.createElement('video');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (video as any).play = vi.fn(() => Promise.resolve());
  (ref as { current: HTMLVideoElement | null }).current = video;
}

describe('useHlsStream — initial state', () => {
  it('starts in state="idle" with a React ref and no error', () => {
    const { result } = renderHook(() => useHlsStream(1));
    expect(result.current.state).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.hasAudio).toBe(false);
    expect(result.current.videoRef).toBeDefined();
    expect('current' in result.current.videoRef).toBe(true);
    expect(typeof result.current.start).toBe('function');
    expect(typeof result.current.stop).toBe('function');
  });
});

describe('useHlsStream — start() lifecycle', () => {
  it('flips state to "connecting" synchronously when start() is called', async () => {
    const { result, unmount } = renderHook(() => useHlsStream(1));
    attachVideo(result.current.videoRef);
    act(() => { result.current.start(); });
    expect(result.current.state).toBe('connecting');
    // Drain the pending fetch so it can't leak an Hls instance into the next test.
    await waitFor(() => expect(instances.length).toBeGreaterThanOrEqual(1));
    unmount();
  });

  it('transitions to "connected" after MANIFEST_PARSED fires', async () => {
    const before = instances.length;
    const { result } = renderHook(() => useHlsStream(1));
    attachVideo(result.current.videoRef);

    act(() => { result.current.start(); });

    // Wait for the hook to create THIS test's Hls instance (fetch resolves,
    // then `new Hls()` runs synchronously inside the .then). The 2 s
    // loadSource delay doesn't gate instance creation.
    await waitFor(() => expect(instances.length).toBeGreaterThan(before));
    const inst = instances[instances.length - 1];

    act(() => {
      inst.fire('hlsManifestParsed', { levels: [{ audioCodec: undefined }] });
    });
    expect(result.current.state).toBe('connected');
  });
});

describe('useHlsStream — stop() resets state to idle', () => {
  it('clears state to "idle" and destroys the hls instance', async () => {
    const before = instances.length;
    const { result } = renderHook(() => useHlsStream(1));
    attachVideo(result.current.videoRef);

    act(() => { result.current.start(); });
    await waitFor(() => expect(instances.length).toBeGreaterThan(before));
    const inst = instances[instances.length - 1];
    act(() => {
      inst.fire('hlsManifestParsed', { levels: [] });
    });
    expect(result.current.state).toBe('connected');

    act(() => { result.current.stop(); });
    expect(result.current.state).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(inst.destroy).toHaveBeenCalled();
  });
});

describe('useHlsStream — fatal errors surface as "failed"', () => {
  it('a fatal non-network/non-media ERROR sets state="failed" with an error message', async () => {
    const before = instances.length;
    const { result } = renderHook(() => useHlsStream(1));
    attachVideo(result.current.videoRef);

    act(() => { result.current.start(); });
    await waitFor(() => expect(instances.length).toBeGreaterThan(before));
    const inst = instances[instances.length - 1];

    act(() => {
      inst.fire('hlsError', { fatal: true, type: 'otherError' });
    });
    expect(result.current.state).toBe('failed');
    expect(result.current.error).toBeTruthy();
  });

  it('a failed POST /start propagates to state="failed" with the error message', async () => {
    server.use(
      http.post('/api/v3/live/:id/start', () =>
        HttpResponse.json({ error: 'X', message: 'start failed' }, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useHlsStream(1));
    attachVideo(result.current.videoRef);

    act(() => { result.current.start(); });

    await waitFor(() => expect(result.current.state).toBe('failed'));
    expect(result.current.error).toBeTruthy();
  });
});

describe('useHlsStream — hasAudio detection', () => {
  it('sets hasAudio=true when any level reports an audioCodec', async () => {
    const before = instances.length;
    const { result } = renderHook(() => useHlsStream(1));
    attachVideo(result.current.videoRef);

    act(() => { result.current.start(); });
    await waitFor(() => expect(instances.length).toBeGreaterThan(before));
    const inst = instances[instances.length - 1];

    act(() => {
      inst.fire('hlsManifestParsed', {
        levels: [{ audioCodec: 'mp4a.40.2' }, { audioCodec: undefined }],
      });
    });
    expect(result.current.hasAudio).toBe(true);
  });

  it('sets hasAudio=false when no level reports an audioCodec', async () => {
    const before = instances.length;
    const { result } = renderHook(() => useHlsStream(1));
    attachVideo(result.current.videoRef);

    act(() => { result.current.start(); });
    await waitFor(() => expect(instances.length).toBeGreaterThan(before));
    const inst = instances[instances.length - 1];

    act(() => {
      inst.fire('hlsManifestParsed', {
        levels: [{ audioCodec: undefined }, { audioCodec: null }],
      });
    });
    expect(result.current.hasAudio).toBe(false);
  });
});
