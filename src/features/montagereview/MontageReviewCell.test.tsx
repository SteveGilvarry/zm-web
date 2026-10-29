/**
 * One Review grid tile: it picks the recorded event spanning the master
 * playhead, syncs that MP4 to the master clock, and falls back to an explicit
 * "No Event" placeholder. jsdom has no media pipeline, so `play`/`pause` and
 * `currentTime` are stubbed on HTMLMediaElement.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import type { Monitor, ZmEvent } from '@/types';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, ...rest }: {
    children: React.ReactNode;
    to?: string;
    params?: Record<string, string>;
    [k: string]: unknown;
  }) => {
    const href = to && params
      ? Object.entries(params).reduce((acc, [k, v]) => acc.replace(`$${k}`, String(v)), to)
      : (to ?? '#');
    return <a href={href} {...rest}>{children}</a>;
  },
  useNavigate: () => navigate,
  useRouter: () => ({ buildLocation: ({ to, params }: { to: string; params?: Record<string, string> }) => ({
    href: params
      ? Object.entries(params).reduce((acc, [k, v]) => acc.replace(`$${k}`, String(v)), to)
      : to,
  }) }),
}));

/** The cell navigates on click (legacy `showOneMonitor`). */
const navigate = vi.fn();

const { MontageReviewCell, REVIEW_ZOOM_STEP } = await import('./MontageReviewCell');
const { REVIEW_MAX_PLAYBACK_RATE } = await import('./useReviewClock');

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'cell.token', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

/** jsdom throws "Not implemented" on play(); give the element a fake transport. */
const play = vi.fn().mockResolvedValue(undefined);
const pause = vi.fn();
let currentTimeStore = 0;
beforeEach(() => {
  navigate.mockClear();
  play.mockClear();
  pause.mockClear();
  currentTimeStore = 0;
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause);
  vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'get').mockImplementation(() => currentTimeStore);
  vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'set')
    .mockImplementation((v: number) => { currentTimeStore = v; });
});

const monitor = (over: Partial<Monitor> = {}) => ({
  id: 1, name: 'Front Door', capturing: 'Always', analysing: 'Always', recording: 'OnMotion',
  width: 1920, height: 1080, orientation: 'ROTATE_0', type: 'Ffmpeg', ...over,
} as unknown as Monitor);

const ev = (id: number, start: string, end: string | null): ZmEvent => ({
  id, monitor_id: 1, name: `Event-${id}`, start_date_time: start, end_date_time: end,
  length: '300.00', archived: 0,
} as unknown as ZmEvent);

const paged = (items: unknown[]) =>
  HttpResponse.json({ items, total: items.length, per_page: 500, current_page: 1, last_page: 1 });

function stubEvents(items: ZmEvent[]) {
  server.use(http.get('/api/v3/events', () => paged(items)));
}

const RANGE_START = new Date('2026-08-21T00:00:00Z');
const RANGE_END = new Date('2026-08-21T12:00:00Z');

function renderCell(over: Partial<Parameters<typeof MontageReviewCell>[0]> = {}) {
  return renderWithProviders(
    <MontageReviewCell
      monitor={monitor()}
      currentTime={new Date('2026-08-21T02:01:00Z')}
      rangeStart={RANGE_START}
      rangeEnd={RANGE_END}
      isPlaying={false}
      speed={1}
      {...over}
    />,
  );
}

describe('MontageReviewCell — event selection', () => {
  it('renders the event spanning the playhead, its deep link and a download', async () => {
    stubEvents([ev(4242, '2026-08-21T02:00:00Z', '2026-08-21T02:05:00Z')]);
    const { container } = renderCell();

    expect(screen.getByText('Front Door')).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: '#4242' });
    expect(link).toHaveAttribute('href', '/events/4242');

    const video = container.querySelector('video')!;
    expect(video.getAttribute('src')).toContain('/events/4242/video');
    // The signed-in token rides along so the <video> tag can authenticate.
    expect(video.getAttribute('src')).toContain('cell.token');

    const download = screen.getByTitle("Download this event's video");
    expect(download).toHaveAttribute('download');
    expect(download.getAttribute('href')).toContain('/events/4242/video');
  });

  it('shows "No Event" when nothing was recorded at that moment', async () => {
    stubEvents([ev(1, '2026-08-21T05:00:00Z', '2026-08-21T05:05:00Z')]);
    renderCell({ currentTime: new Date('2026-08-21T02:00:00Z') });
    expect(await screen.findByText('No Event')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^#/ })).toBeNull();
  });

  it('shows the loading placeholder before the events land', () => {
    server.use(http.get('/api/v3/events', () => new Promise(() => {})));
    renderCell();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('No Event')).toBeNull();
  });

  it('falls back to "No Event" when the events query 500s', async () => {
    server.use(
      http.get('/api/v3/events', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'nope' }, { status: 500 }),
      ),
    );
    renderCell();
    expect(await screen.findByText('No Event')).toBeInTheDocument();
  });

  it('falls back to "No Event" when the network is down', async () => {
    server.use(http.get('/api/v3/events', () => HttpResponse.error()));
    renderCell();
    expect(await screen.findByText('No Event')).toBeInTheDocument();
  });

  it('an in-progress event (no end_date_time) plays right up to now', async () => {
    vi.setSystemTime(new Date('2026-08-21T03:00:00Z'));
    try {
      stubEvents([ev(77, '2026-08-21T02:30:00Z', null)]);
      renderCell({ currentTime: new Date('2026-08-21T02:45:00Z') });
      expect(await screen.findByRole('link', { name: '#77' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('MontageReviewCell — master clock sync', () => {
  it('seeks the video to the playhead offset within the event', async () => {
    stubEvents([ev(9, '2026-08-21T02:00:00Z', '2026-08-21T02:10:00Z')]);
    renderCell({ currentTime: new Date('2026-08-21T02:01:00Z') });
    await screen.findByRole('link', { name: '#9' });
    // 60 s into the event.
    await waitFor(() => expect(currentTimeStore).toBe(60));
  });

  it('leaves the video alone while the drift is under a second', async () => {
    stubEvents([ev(9, '2026-08-21T02:00:00Z', '2026-08-21T02:10:00Z')]);
    const { rerender } = renderCell({ currentTime: new Date('2026-08-21T02:01:00Z') });
    await screen.findByRole('link', { name: '#9' });
    await waitFor(() => expect(currentTimeStore).toBe(60));

    // A 500 ms nudge is below the re-seek threshold, so the value stands.
    rerender(
      <MontageReviewCell
        monitor={monitor()}
        currentTime={new Date('2026-08-21T02:01:00.500Z')}
        rangeStart={RANGE_START}
        rangeEnd={RANGE_END}
        isPlaying={false}
        speed={1}
      />,
    );
    expect(currentTimeStore).toBe(60);
  });

  it('never seeks to a negative offset', async () => {
    stubEvents([ev(9, '2026-08-21T02:00:00Z', '2026-08-21T02:10:00Z')]);
    // findEventAt still matches at exactly the start; the clamp guards the
    // instant the playhead sits fractionally behind it.
    renderCell({ currentTime: new Date('2026-08-21T02:00:00Z') });
    await screen.findByRole('link', { name: '#9' });
    await waitFor(() => expect(currentTimeStore).toBeGreaterThanOrEqual(0));
  });

  it('follows the master play state and playback rate', async () => {
    stubEvents([ev(9, '2026-08-21T02:00:00Z', '2026-08-21T02:10:00Z')]);
    const { container, rerender } = renderCell({ isPlaying: true, speed: 4 });
    await screen.findByRole('link', { name: '#9' });

    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(container.querySelector('video')!.playbackRate).toBe(4);

    rerender(
      <MontageReviewCell
        monitor={monitor()}
        currentTime={new Date('2026-08-21T02:01:00Z')}
        rangeStart={RANGE_START}
        rangeEnd={RANGE_END}
        isPlaying={false}
        speed={1}
      />,
    );
    await waitFor(() => expect(pause).toHaveBeenCalled());
  });

  it('swallows a rejected play() (autoplay policy) instead of crashing', async () => {
    play.mockRejectedValueOnce(new DOMException('NotAllowedError'));
    stubEvents([ev(9, '2026-08-21T02:00:00Z', '2026-08-21T02:10:00Z')]);
    renderCell({ isPlaying: true });
    expect(await screen.findByRole('link', { name: '#9' })).toBeInTheDocument();
  });

  it('does not touch a video that is not there (no current event)', async () => {
    stubEvents([]);
    renderCell({ isPlaying: true, speed: 2 });
    await screen.findByText('No Event');
    expect(play).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
  });

  it('ignores an event whose start time will not parse', async () => {
    stubEvents([{ ...ev(9, '2026-08-21T02:00:00Z', '2026-08-21T02:10:00Z'), start_date_time: 'nonsense' } as ZmEvent]);
    renderCell();
    expect(await screen.findByText('No Event')).toBeInTheDocument();
  });

  it('a rotated monitor gets a portrait cell and plays the recording as decoded, untouched', async () => {
    stubEvents([ev(9, '2026-08-21T02:00:00Z', '2026-08-21T02:10:00Z')]);
    const { container } = renderCell({ monitor: monitor({ orientation: 'ROTATE_90' } as Partial<Monitor>) });
    await screen.findByRole('link', { name: '#9' });
    expect(screen.getByTestId('review-cell-1').style.aspectRatio).toBe('1080 / 1920');
    const video = container.querySelector('video')!;
    // ZoneMinder writes the rotation into the mp4, so the decoder hands back
    // an upright portrait frame; a CSS turn on top would lay it on its side.
    expect(video.className).toContain('w-full h-full');
    expect(video.getAttribute('style')).toBeNull();
    Object.defineProperty(video, 'videoWidth', { value: 1080, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 1920, configurable: true });
    await act(async () => { video.dispatchEvent(new Event('loadedmetadata')); });
    expect(video.getAttribute('style')).toBeNull();
  });

  it('turns the video only when the decoder ignored the rotation and handed back a landscape frame', async () => {
    stubEvents([ev(9, '2026-08-21T02:00:00Z', '2026-08-21T02:10:00Z')]);
    const { container } = renderCell({ monitor: monitor({ orientation: 'ROTATE_90' } as Partial<Monitor>) });
    await screen.findByRole('link', { name: '#9' });
    const video = container.querySelector('video')!;
    Object.defineProperty(video, 'videoWidth', { value: 1920, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 1080, configurable: true });
    await act(async () => { video.dispatchEvent(new Event('loadedmetadata')); });
    // 1920×1080 turned 90°: the element is (1920/1080) wide and (1080/1920)
    // tall relative to the portrait box, so after the turn it fills it.
    expect(video.style.width).toBe(`${(1920 / 1080) * 100}%`);
    expect(video.style.height).toBe(`${(1080 / 1920) * 100}%`);
    expect(video.style.maxWidth).toBe('none');
    expect(video.style.transform).toContain('rotate(90deg)');
  });

  it("classic: a bare black box with legacy's corner marks and no name or event badges", async () => {
    stubEvents([ev(9, '2026-08-21T02:00:00Z', '2026-08-21T02:10:00Z')]);
    renderCell({ variant: 'classic', onZoom: () => {} });
    await screen.findByTestId('review-cell-1');
    const cell = screen.getByTestId('review-cell-1');
    expect(cell.className).toContain('bg-black');
    expect(cell.className).not.toContain('rounded');
    expect(cell.style.containerType).toBe('size');
    expect(screen.queryByText('Front Door')).toBeNull();
    expect(screen.queryByRole('link', { name: '#9' })).toBeNull();
    expect(screen.queryByTitle("Download this event's video")).toBeNull();
    // `imagedone`: a tenth of the canvas's longer side.
    expect(screen.getByTestId('review-zoom-in-1').className).toContain('text-[length:max(10cqw,10cqh)]');
  });

  it('classic: "No Event" written across the box at 15 % of its width', async () => {
    stubEvents([]);
    renderCell({ variant: 'classic' });
    const text = await screen.findByText('No Event');
    expect(text.className).toContain('text-[length:15cqw]');
    expect(text.parentElement?.className).toContain('text-white');
  });

  it('an unrotated monitor keeps a landscape cell and a full-size video', async () => {
    stubEvents([ev(9, '2026-08-21T02:00:00Z', '2026-08-21T02:10:00Z')]);
    const { container } = renderCell();
    await screen.findByRole('link', { name: '#9' });
    expect(screen.getByTestId('review-cell-1').style.aspectRatio).toBe('1920 / 1080');
    const video = container.querySelector('video')!;
    expect(video.className).toContain('w-full h-full');
    expect(video.getAttribute('style')).toBeNull();
  });
});

/**
 * Legacy `clickMonitor` / `showOneMonitor`: corners zoom the one monitor,
 * the middle opens the event under the playhead (or Watch when the monitor
 * recorded nothing), and Ctrl/⌘ opens a new tab.
 */
describe('MontageReviewCell — click', () => {
  /** jsdom gives every element a zero-size rect; give the cell a real one. */
  function sizedCell(over: Partial<Parameters<typeof MontageReviewCell>[0]> = {}) {
    const view = renderCell(over);
    const cell = screen.getByTestId('review-cell-1');
    vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    return { ...view, cell };
  }

  it('opens the event spanning the playhead', async () => {
    stubEvents([ev(9, '2026-08-21T02:00:00Z', '2026-08-21T02:10:00Z')]);
    const { cell } = sizedCell();
    await screen.findByRole('link', { name: '#9' });

    fireEvent.click(cell, { clientX: 200, clientY: 150 });
    expect(navigate).toHaveBeenCalledWith({ to: '/events/$eventId', params: { eventId: '9' } });
  });

  it('hands the frame under the playhead along when the event has a frame count', async () => {
    stubEvents([{ ...ev(9, '2026-08-21T02:00:00Z', '2026-08-21T02:05:00Z'), frames: 3000 } as ZmEvent]);
    const { cell } = sizedCell({ currentTime: new Date('2026-08-21T02:01:00Z') });
    await screen.findByRole('link', { name: '#9' });
    fireEvent.click(cell, { clientX: 200, clientY: 150 });
    // 60 s into a 300 s, 3000-frame event: frame 601 (legacy montagereview.js:1179).
    expect(navigate).toHaveBeenCalledWith({ to: '/events/$eventId', params: { eventId: '9' }, search: { fid: 601 } });
  });

  it('opens the Watch page when the monitor recorded nothing', async () => {
    stubEvents([]);
    const { cell } = sizedCell();
    await screen.findByText('No Event');

    fireEvent.click(cell, { clientX: 200, clientY: 150 });
    expect(navigate).toHaveBeenCalledWith({ to: '/monitors/$monitorId', params: { monitorId: '1' } });
  });

  it('zooms ±15 % from the two top corners', async () => {
    stubEvents([]);
    const onZoom = vi.fn();
    const { cell } = sizedCell({ onZoom });
    await screen.findByText('No Event');

    fireEvent.click(cell, { clientX: 10, clientY: 10 });
    expect(onZoom).toHaveBeenLastCalledWith(REVIEW_ZOOM_STEP);

    fireEvent.click(cell, { clientX: 390, clientY: 10 });
    expect(onZoom).toHaveBeenLastCalledWith(1 / REVIEW_ZOOM_STEP);

    // The middle is not a zoom.
    fireEvent.click(cell, { clientX: 200, clientY: 150 });
    expect(onZoom).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalled();
  });

  it('marks the zoom corners with + and -, and only when they zoom', async () => {
    stubEvents([ev(9, '2026-08-21T02:00:00Z', '2026-08-21T02:10:00Z')]);
    const { unmount } = renderCell({ onZoom: vi.fn() });
    const link = await screen.findByRole('link', { name: '#9' });
    expect(screen.getByTestId('review-zoom-in-1')).toHaveTextContent('+');
    expect(screen.getByTestId('review-zoom-out-1')).toHaveTextContent('-');
    // The badges give the corners up and sit along the bottom.
    expect(link.parentElement).toHaveClass('bottom-1.5');
    expect(screen.getByText('Front Door').parentElement).toHaveClass('bottom-1.5');
    unmount();

    renderCell();
    await screen.findByRole('link', { name: '#9' });
    expect(screen.queryByTestId('review-zoom-in-1')).toBeNull();
    expect(screen.getByText('Front Door').parentElement).toHaveClass('top-1.5');
  });

  it('opens a new tab on Ctrl+click instead of navigating', async () => {
    stubEvents([ev(9, '2026-08-21T02:00:00Z', '2026-08-21T02:10:00Z')]);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { cell } = sizedCell();
    await screen.findByRole('link', { name: '#9' });

    fireEvent.click(cell, { clientX: 200, clientY: 150, ctrlKey: true });
    expect(open).toHaveBeenCalledWith('/events/9', '_blank', 'noopener');
    expect(navigate).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('leaves the #id link and the download icon to themselves', async () => {
    stubEvents([ev(9, '2026-08-21T02:00:00Z', '2026-08-21T02:10:00Z')]);
    sizedCell();
    fireEvent.click(await screen.findByRole('link', { name: '#9' }));
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('MontageReviewCell — playback rate', () => {
  it('caps the video rate where browsers stop decoding, and steps above it', async () => {
    stubEvents([ev(9, '2026-08-21T02:00:00Z', '2026-08-21T02:10:00Z')]);
    const { container } = renderCell({ isPlaying: true, speed: 50 });
    await screen.findByRole('link', { name: '#9' });
    const video = container.querySelector('video')!;
    await waitFor(() => expect(video.playbackRate).toBe(REVIEW_MAX_PLAYBACK_RATE));
  });
});
