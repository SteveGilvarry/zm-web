/**
 * `useEventVideo` decides *what* is attached to the event player's <video>:
 * a progressive MP4, an hls.js session, or nothing at all when the browser
 * cannot decode the codec. These tests drive all three branches plus the
 * teardown that runs when the event or the mode changes.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAuthStore } from '@/stores/auth';
import type { EventVideoInfo } from '@/api/events';

interface HlsInstance {
  config: Record<string, unknown>;
  loadSource: ReturnType<typeof vi.fn>;
  attachMedia: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  fire: (event: string, data?: unknown) => void;
}

// Lives in hoisted scope so it survives `vi.resetModules()` — the Safari suite
// at the bottom re-imports the hook to get a fresh native-HLS capability cache.
const hlsState = vi.hoisted(() => ({
  supported: true,
  instances: [] as HlsInstance[],
}));

vi.mock('hls.js', () => {
  type Handler = (event: string, data: unknown) => void;
  function HlsCtor(config: Record<string, unknown>) {
    const handlers = new Map<string, Handler>();
    const inst: HlsInstance = {
      config,
      loadSource: vi.fn(),
      attachMedia: vi.fn(),
      destroy: vi.fn(),
      fire: (event, data) => handlers.get(event)?.(event, data),
    };
    (inst as unknown as { on: (e: string, cb: Handler) => void }).on = (e, cb) => { handlers.set(e, cb); };
    hlsState.instances.push(inst);
    return inst;
  }
  const ctor = HlsCtor as unknown as Record<string, unknown>;
  ctor.isSupported = () => hlsState.supported;
  ctor.Events = { ERROR: 'hlsError' };
  return { default: HlsCtor };
});

const { useEventVideo } = await import('./useEventVideo');

const TOKEN = 'tok/en+with=chars';
const ENCODED = encodeURIComponent(TOKEN);

const info = (over: Partial<EventVideoInfo> = {}): EventVideoInfo => ({
  event_id: 42,
  video_codec: 'H264',
  width: 1920,
  height: 1080,
  duration_seconds: 30,
  file_size: 1_000_000,
  playable_direct: true,
  recommended_mode: 'direct',
  ...over,
});

const HLS_INFO = info({ video_codec: 'H265', playable_direct: false, recommended_mode: 'hls' });

/** A <video> that survives jsdom: `load()` is a no-op we can assert on. */
function makeVideo() {
  const video = document.createElement('video');
  Object.assign(video, { load: vi.fn() });
  return video;
}

function refTo(video: HTMLVideoElement | null) {
  return { current: video } as React.RefObject<HTMLVideoElement | null>;
}

beforeEach(() => {
  hlsState.supported = true;
  hlsState.instances.length = 0;
  useAuthStore.setState({ accessToken: TOKEN, refreshToken: 'r', user: null, isAuthenticated: true });
});
afterEach(() => { useAuthStore.getState().clearAuth(); });

/* -------------------------------------------------------------------------- */

describe('useEventVideo — direct progressive playback', () => {
  it('attaches the tokenised MP4 stream URL and reports mode="direct"', () => {
    const video = makeVideo();
    const { result } = renderHook(() => useEventVideo(refTo(video), 42, info()));

    expect(result.current.mode).toBe('direct');
    expect(result.current.error).toBeNull();
    expect(video.getAttribute('src')).toBe(`/api/v3/events/42/stream/video.mp4?token=${ENCODED}`);
    expect(hlsState.instances).toHaveLength(0);
  });

  it('leaves the token off the URL when the store has none', () => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null, isAuthenticated: true });
    const video = makeVideo();
    renderHook(() => useEventVideo(refTo(video), 42, info()));
    expect(video.getAttribute('src')).toBe('/api/v3/events/42/stream/video.mp4');
  });

  it('does nothing at all before the info request resolves', () => {
    const video = makeVideo();
    const { result } = renderHook(() => useEventVideo(refTo(video), 42, undefined));
    expect(result.current.mode).toBe('direct');
    expect(video.hasAttribute('src')).toBe(false);
    expect(video.load).not.toHaveBeenCalled();
  });

  it('does nothing when the element is not mounted yet', () => {
    const { result } = renderHook(() => useEventVideo(refTo(null), 42, info()));
    expect(result.current.mode).toBe('direct');
    expect(hlsState.instances).toHaveLength(0);
  });

  it('re-points the element when the event id changes', () => {
    const video = makeVideo();
    const { rerender } = renderHook(
      ({ id }: { id: number }) => useEventVideo(refTo(video), id, info()),
      { initialProps: { id: 42 } },
    );
    expect(video.getAttribute('src')).toContain('/events/42/');

    rerender({ id: 43 });
    expect(video.getAttribute('src')).toContain('/events/43/');
    expect(video.load).toHaveBeenCalledTimes(2);
  });
});

describe('useEventVideo — hls.js playback', () => {
  it('builds an authenticated hls.js session on the playlist URL', () => {
    const video = makeVideo();
    const { result } = renderHook(() => useEventVideo(refTo(video), 42, HLS_INFO));

    expect(result.current.mode).toBe('hls');
    expect(result.current.error).toBeNull();
    expect(hlsState.instances).toHaveLength(1);
    const inst = hlsState.instances[0];
    expect(inst.attachMedia).toHaveBeenCalledWith(video);
    expect(inst.loadSource).toHaveBeenCalledWith(`/api/v3/events/42/stream/playlist.m3u8?token=${ENCODED}`);
    // The element itself is left without a src — hls.js drives it via MSE.
    expect(video.hasAttribute('src')).toBe(false);

    const setRequestHeader = vi.fn();
    (inst.config.xhrSetup as (xhr: unknown, url: string) => void)(
      { setRequestHeader } as unknown as XMLHttpRequest, '/seg.m4s',
    );
    expect(setRequestHeader).toHaveBeenCalledWith('Authorization', `Bearer ${TOKEN}`);
  });

  it('skips the Bearer header when the store has no token', () => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null, isAuthenticated: true });
    const video = makeVideo();
    renderHook(() => useEventVideo(refTo(video), 42, HLS_INFO));

    const setRequestHeader = vi.fn();
    (hlsState.instances[0].config.xhrSetup as (xhr: unknown, url: string) => void)(
      { setRequestHeader } as unknown as XMLHttpRequest, '/seg.m4s',
    );
    expect(setRequestHeader).not.toHaveBeenCalled();
  });

  it('treats a fatal hls error as an unsupported codec, and only for that event', () => {
    const video = makeVideo();
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useEventVideo(refTo(video), id, HLS_INFO),
      { initialProps: { id: 42 } },
    );
    const inst = hlsState.instances[0];

    act(() => { inst.fire('hlsError', { fatal: true, type: 'mediaError' }); });
    expect(result.current.mode).toBe('unsupported');
    expect(result.current.error).toBe('This video codec is not supported in this browser.');
    expect(inst.destroy).toHaveBeenCalled();

    // A different event starts clean rather than inheriting the failure.
    rerender({ id: 43 });
    expect(result.current.mode).toBe('hls');
    expect(result.current.error).toBeNull();
  });

  it('ignores a non-fatal hls error', () => {
    const video = makeVideo();
    const { result } = renderHook(() => useEventVideo(refTo(video), 42, HLS_INFO));
    act(() => { hlsState.instances[0].fire('hlsError', { fatal: false, type: 'networkError' }); });
    expect(result.current.mode).toBe('hls');
    expect(hlsState.instances[0].destroy).not.toHaveBeenCalled();
  });

  it('destroys the hls session on unmount', () => {
    const video = makeVideo();
    const { unmount } = renderHook(() => useEventVideo(refTo(video), 42, HLS_INFO));
    const inst = hlsState.instances[0];
    unmount();
    expect(inst.destroy).toHaveBeenCalled();
  });

  it('tears the hls session down when the event switches to a direct one', () => {
    const video = makeVideo();
    const { rerender, result } = renderHook(
      ({ i }: { i: EventVideoInfo }) => useEventVideo(refTo(video), 42, i),
      { initialProps: { i: HLS_INFO } },
    );
    const inst = hlsState.instances[0];

    rerender({ i: info() });
    expect(result.current.mode).toBe('direct');
    expect(inst.destroy).toHaveBeenCalled();
    expect(video.getAttribute('src')).toContain('/stream/video.mp4');
  });
});

describe('useEventVideo — codec the browser cannot decode', () => {
  it('reports "unsupported" and attaches nothing when neither MSE nor native HLS is available', () => {
    hlsState.supported = false; // jsdom's canPlayType() is '' → no native HLS either
    const video = makeVideo();
    const { result } = renderHook(() => useEventVideo(refTo(video), 42, HLS_INFO));

    expect(result.current.mode).toBe('unsupported');
    expect(result.current.error).toBe('This video codec is not supported in this browser.');
    expect(hlsState.instances).toHaveLength(0);
    expect(video.hasAttribute('src')).toBe(false);
    // The element is still reset, so a previous event's source is not left playing.
    expect(video.load).toHaveBeenCalled();
  });
});

describe('useEventVideo — Safari native HLS', () => {
  it('hands the playlist straight to the element when only native HLS is available', async () => {
    const original = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = () => 'maybe';
    // The native-HLS probe is cached at module scope; re-import for a clean one.
    vi.resetModules();
    try {
      hlsState.supported = false;
      const { useEventVideo: freshHook } = await import('./useEventVideo');
      // resetModules gave the hook a fresh auth-store instance too.
      const { useAuthStore: freshAuth } = await import('@/stores/auth');
      freshAuth.setState({ accessToken: TOKEN, refreshToken: 'r', user: null, isAuthenticated: true });
      const video = makeVideo();
      const { result } = renderHook(() => freshHook(refTo(video), 42, HLS_INFO));

      expect(result.current.mode).toBe('hls');
      expect(hlsState.instances).toHaveLength(0);
      expect(video.getAttribute('src')).toBe(`/api/v3/events/42/stream/playlist.m3u8?token=${ENCODED}`);
    } finally {
      HTMLMediaElement.prototype.canPlayType = original;
      vi.resetModules();
    }
  });
});
