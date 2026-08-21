/**
 * One Review grid tile: it picks the recorded event spanning the master
 * playhead, syncs that MP4 to the master clock, and falls back to an explicit
 * "No Event" placeholder. jsdom has no media pipeline, so `play`/`pause` and
 * `currentTime` are stubbed on HTMLMediaElement.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
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
}));

const { MontageReviewCell } = await import('./MontageReviewCell');

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'cell.token', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
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

  it('applies the monitor orientation to the video element', async () => {
    stubEvents([ev(9, '2026-08-21T02:00:00Z', '2026-08-21T02:10:00Z')]);
    const { container } = renderCell({ monitor: monitor({ orientation: 'ROTATE_90' } as Partial<Monitor>) });
    await screen.findByRole('link', { name: '#9' });
    const video = container.querySelector('video')!;
    expect(video.getAttribute('style')).toContain('rotate');
  });
});
