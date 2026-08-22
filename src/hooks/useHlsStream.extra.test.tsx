/**
 * The paths `useHlsStream.test.tsx` leaves alone: the Bearer header hls.js
 * puts on its own XHRs, the `master.m3u8` playlist it eventually loads, media
 * error recovery, FRAG_BUFFERED healing, and the whole Safari native-HLS
 * branch — including re-pointing `<video src>` when the access token rotates.
 */
import { describe, expect, it, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/stores/auth';

/* --- hls.js mock ---------------------------------------------------------- */

interface HlsInstance {
  config: Record<string, unknown>;
  loadSource: ReturnType<typeof vi.fn>;
  attachMedia: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  startLoad: ReturnType<typeof vi.fn>;
  recoverMediaError: ReturnType<typeof vi.fn>;
  swapAudioCodec: ReturnType<typeof vi.fn>;
  fire: (event: string, data?: unknown) => void;
}

vi.mock('hls.js', () => {
  type Handler = (event: string, data: unknown) => void;
  const instances: HlsInstance[] = [];
  const supported = { value: true };

  function HlsCtor(config: Record<string, unknown>) {
    const handlers = new Map<string, Handler>();
    const inst: HlsInstance = {
      config,
      loadSource: vi.fn(),
      attachMedia: vi.fn(),
      destroy: vi.fn(),
      startLoad: vi.fn(),
      recoverMediaError: vi.fn(),
      swapAudioCodec: vi.fn(),
      fire: (event, data) => handlers.get(event)?.(event, data),
    };
    (inst as unknown as { on: (e: string, cb: Handler) => void }).on = (e, cb) => { handlers.set(e, cb); };
    instances.push(inst);
    return inst;
  }
  const ctor = HlsCtor as unknown as Record<string, unknown>;
  ctor.isSupported = () => supported.value;
  ctor.Events = { MANIFEST_PARSED: 'hlsManifestParsed', ERROR: 'hlsError', FRAG_BUFFERED: 'hlsFragBuffered' };
  ctor.ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError', OTHER_ERROR: 'otherError' };

  return {
    default: HlsCtor,
    __instances: instances,
    __supported: supported,
    __reset: () => { instances.length = 0; supported.value = true; },
  };
});

const hlsNs = await import('hls.js') as unknown as {
  __instances: HlsInstance[];
  __supported: { value: boolean };
  __reset: () => void;
};
const { __instances: instances, __supported: supported, __reset: reset } = hlsNs;

const { useHlsStream, HLS_TIMING } = await import('./useHlsStream');

/* --- harness -------------------------------------------------------------- */

const TOKEN = 'jwt-header.jwt-payload.jwt-signature';

const server = setupServer(
  http.post('/api/v3/live/:id/start', () => HttpResponse.json({ session_id: 's', status: 'started' })),
);

beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => {
  useAuthStore.setState({ accessToken: TOKEN, refreshToken: 'r', user: null, isAuthenticated: true });
});
afterEach(() => { server.resetHandlers(); reset(); vi.useRealTimers(); });
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

/** A <video> jsdom can live with: `play()` resolves, `canPlayType` is scriptable. */
function makeVideo(canPlayHls = false): HTMLVideoElement {
  const video = document.createElement('video');
  Object.assign(video, {
    play: vi.fn(() => Promise.resolve()),
    canPlayType: () => (canPlayHls ? 'maybe' : ''),
  });
  return video;
}

function attach(
  ref: React.RefObject<HTMLVideoElement | null>,
  video: HTMLVideoElement = makeVideo(),
): HTMLVideoElement {
  (ref as { current: HTMLVideoElement | null }).current = video;
  return video;
}

/** start() the hook and wait for the Hls instance it builds. */
async function startAndWait(result: { current: ReturnType<typeof useHlsStream> }) {
  const before = instances.length;
  act(() => { result.current.start(); });
  await waitFor(() => expect(instances.length).toBeGreaterThan(before));
  return instances[instances.length - 1];
}

/* -------------------------------------------------------------------------- */

describe('useHlsStream — authenticated playlist fetches', () => {
  it('adds the Bearer header to every hls.js XHR and loads master.m3u8', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useHlsStream(7));
    attach(result.current.videoRef);
    const inst = await startAndWait(result);

    const setRequestHeader = vi.fn();
    (inst.config.xhrSetup as (xhr: unknown, url: string) => void)(
      { setRequestHeader } as unknown as XMLHttpRequest,
      '/api/v3/live/7/hls/segment-1.m4s',
    );
    expect(setRequestHeader).toHaveBeenCalledWith('Authorization', `Bearer ${TOKEN}`);

    // The playlist is only loaded once the transcoder has had its head start.
    expect(inst.loadSource).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(HLS_TIMING.STARTUP_DELAY_MS); });
    expect(inst.loadSource).toHaveBeenCalledWith('/api/v3/live/7/hls/master.m3u8');
  });

  it('omits the header when there is no token', async () => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null, isAuthenticated: true });
    const { result } = renderHook(() => useHlsStream(7));
    attach(result.current.videoRef);
    const inst = await startAndWait(result);

    const setRequestHeader = vi.fn();
    (inst.config.xhrSetup as (xhr: unknown, url: string) => void)(
      { setRequestHeader } as unknown as XMLHttpRequest, '/seg',
    );
    expect(setRequestHeader).not.toHaveBeenCalled();
  });
});

describe('useHlsStream — media errors escalate then give up', () => {
  it('recovers, swaps codec, then fails on the third fatal media error', async () => {
    const { result } = renderHook(() => useHlsStream(1));
    attach(result.current.videoRef);
    const inst = await startAndWait(result);
    act(() => { inst.fire('hlsManifestParsed', { levels: [] }); });

    act(() => { inst.fire('hlsError', { fatal: true, type: 'mediaError' }); });
    expect(inst.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(inst.swapAudioCodec).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Media error - recovering...');
    expect(result.current.state).toBe('connected');

    act(() => { inst.fire('hlsError', { fatal: true, type: 'mediaError' }); });
    expect(inst.swapAudioCodec).toHaveBeenCalledTimes(1);
    expect(inst.recoverMediaError).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBe('Media error - switching codec...');

    act(() => { inst.fire('hlsError', { fatal: true, type: 'mediaError' }); });
    expect(result.current.state).toBe('failed');
    expect(result.current.error).toBe('Media playback failed');
    expect(inst.destroy).toHaveBeenCalled();
  });

  it('ignores non-fatal errors entirely', async () => {
    const { result } = renderHook(() => useHlsStream(1));
    attach(result.current.videoRef);
    const inst = await startAndWait(result);
    act(() => { inst.fire('hlsManifestParsed', { levels: [] }); });

    act(() => { inst.fire('hlsError', { fatal: false, type: 'mediaError' }); });
    expect(inst.recoverMediaError).not.toHaveBeenCalled();
    expect(result.current.state).toBe('connected');
    expect(result.current.error).toBeNull();
  });
});

describe('useHlsStream — FRAG_BUFFERED clears the slate', () => {
  it('clears the retry error, resets the counters and resumes a paused element', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const video = makeVideo();
    Object.defineProperty(video, 'paused', { value: true, configurable: true });
    const { result } = renderHook(() => useHlsStream(1));
    attach(result.current.videoRef, video);
    const inst = await startAndWait(result);
    act(() => { inst.fire('hlsManifestParsed', { levels: [] }); });

    act(() => { inst.fire('hlsError', { fatal: true, type: 'networkError' }); });
    expect(result.current.error).toContain('(1/5)');

    act(() => { inst.fire('hlsFragBuffered'); });
    expect(result.current.error).toBeNull();
    expect(video.play).toHaveBeenCalled();

    // Counter reset: the next network error is attempt 1 again.
    act(() => { inst.fire('hlsError', { fatal: true, type: 'networkError' }); });
    expect(result.current.error).toContain('(1/5)');
  });

  it('leaves a playing element alone', async () => {
    const video = makeVideo();
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    const { result } = renderHook(() => useHlsStream(1));
    attach(result.current.videoRef, video);
    const inst = await startAndWait(result);
    act(() => { inst.fire('hlsManifestParsed', { levels: [] }); });
    (video.play as ReturnType<typeof vi.fn>).mockClear();

    act(() => { inst.fire('hlsFragBuffered'); });
    expect(video.play).not.toHaveBeenCalled();
  });
});

describe('useHlsStream — stop() cancels pending work', () => {
  it('clears a scheduled network retry so it never reloads after teardown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useHlsStream(1));
    attach(result.current.videoRef);
    const inst = await startAndWait(result);
    act(() => { inst.fire('hlsManifestParsed', { levels: [] }); });
    act(() => { inst.fire('hlsError', { fatal: true, type: 'networkError' }); });

    act(() => { result.current.stop(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(HLS_TIMING.MAX_RETRY_DELAY_MS * 2); });

    expect(inst.startLoad).not.toHaveBeenCalled();
    expect(inst.destroy).toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });
});

describe('useHlsStream — missing video element', () => {
  it('fails with a clear message when the ref was never attached', async () => {
    const { result } = renderHook(() => useHlsStream(1));
    act(() => { result.current.start(); });
    await waitFor(() => expect(result.current.state).toBe('failed'));
    expect(result.current.error).toBe('Video element not available');
    expect(instances).toHaveLength(0);
  });
});

describe('useHlsStream — Safari native HLS', () => {
  beforeEach(() => { supported.value = false; });

  it('points <video> at the tokenised playlist and connects on loadedmetadata', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const video = makeVideo(true);
    const { result } = renderHook(() => useHlsStream(4));
    attach(result.current.videoRef, video);

    act(() => { result.current.start(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(HLS_TIMING.STARTUP_DELAY_MS); });

    expect(instances).toHaveLength(0);
    expect(video.getAttribute('src')).toBe(`/api/v3/live/4/hls/master.m3u8?token=${TOKEN}`);

    act(() => { video.dispatchEvent(new Event('loadedmetadata')); });
    expect(result.current.state).toBe('connected');
    expect(result.current.hasAudio).toBe(true);
    expect(video.play).toHaveBeenCalled();
  });

  it('re-points src when the access token rotates mid-stream', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const video = makeVideo(true);
    const { result } = renderHook(() => useHlsStream(4));
    attach(result.current.videoRef, video);

    act(() => { result.current.start(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(HLS_TIMING.STARTUP_DELAY_MS); });
    act(() => { video.dispatchEvent(new Event('loadedmetadata')); });

    act(() => { useAuthStore.setState({ accessToken: 'rotated.jwt.value' }); });
    expect(video.getAttribute('src')).toBe('/api/v3/live/4/hls/master.m3u8?token=rotated.jwt.value');

    // A store write that leaves the token alone must not touch the element.
    const current = video.getAttribute('src');
    act(() => { useAuthStore.setState({ refreshToken: 'another' }); });
    expect(video.getAttribute('src')).toBe(current);
  });

  it('reports a playback error from the element', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const video = makeVideo(true);
    const { result } = renderHook(() => useHlsStream(4));
    attach(result.current.videoRef, video);

    act(() => { result.current.start(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(HLS_TIMING.STARTUP_DELAY_MS); });
    act(() => { video.dispatchEvent(new Event('error')); });

    expect(result.current.state).toBe('failed');
    expect(result.current.error).toBe('Stream playback error');
  });

  it('stop() unsubscribes the token listener and detaches the element listeners', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const video = makeVideo(true);
    const { result } = renderHook(() => useHlsStream(4));
    attach(result.current.videoRef, video);

    act(() => { result.current.start(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(HLS_TIMING.STARTUP_DELAY_MS); });
    act(() => { result.current.stop(); });

    expect(result.current.state).toBe('idle');
    expect(video.hasAttribute('src')).toBe(false);

    // Neither a rotation nor a late element event revives the torn-down player.
    act(() => { useAuthStore.setState({ accessToken: 'rotated.after.stop' }); });
    expect(video.hasAttribute('src')).toBe(false);
    act(() => { video.dispatchEvent(new Event('loadedmetadata')); });
    expect(result.current.state).toBe('idle');
  });

  it('fails when neither MSE nor native HLS can play the stream', async () => {
    const { result } = renderHook(() => useHlsStream(4));
    attach(result.current.videoRef, makeVideo(false));

    act(() => { result.current.start(); });
    await waitFor(() => expect(result.current.state).toBe('failed'));
    expect(result.current.error).toBe('HLS not supported in this browser');
  });
});
