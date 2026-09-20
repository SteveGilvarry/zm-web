/**
 * The Review timeline: one track per monitor, recorded events as bars, and a
 * playhead you scrub by pointer. jsdom reports a zero-width rect for every
 * element, so `getBoundingClientRect` is stubbed wherever the seek maths
 * needs a real width.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import type { Monitor, ZmEvent } from '@/types';
import { MontageReviewTimeline } from './MontageReviewTimeline';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const monitor = (id: number, name: string) => ({
  id, name, capturing: 'Always', analysing: 'Always', recording: 'OnMotion',
  width: 1920, height: 1080, orientation: 'ROTATE_0', type: 'Ffmpeg',
} as unknown as Monitor);

const ev = (
  id: number, monitorId: number, start: string, end: string | null, over: Partial<ZmEvent> = {},
): ZmEvent => ({
  id,
  monitor_id: monitorId,
  name: `Event-${id}`,
  start_date_time: start,
  end_date_time: end,
  length: '30.00',
  archived: 0,
  ...over,
} as unknown as ZmEvent);

const paged = (items: unknown[]) =>
  HttpResponse.json({ items, total: items.length, per_page: 500, current_page: 1, last_page: 1 });

/** Serve `events` for monitor 1 and nothing for anyone else. */
function stubEvents(events: ZmEvent[], forMonitor = 1) {
  server.use(
    http.get('/api/v3/events', ({ request }) => {
      const q = new URL(request.url).searchParams;
      return paged(q.get('monitor_id') === String(forMonitor) ? events : []);
    }),
  );
}

/** Make the tracks container measurable: 1000 px wide starting at x=0. */
function stubTrackWidth(width = 1000, left = 0) {
  const spy = vi
    .spyOn(HTMLDivElement.prototype, 'getBoundingClientRect')
    .mockReturnValue({
      width, height: 40, left, right: left + width, top: 0, bottom: 40, x: left, y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  return spy;
}

const RANGE_START = new Date('2026-08-21T00:00:00Z');
const RANGE_END = new Date('2026-08-21T12:00:00Z');   // 12 h window

function renderTimeline(over: Partial<Parameters<typeof MontageReviewTimeline>[0]> = {}) {
  const onSeek = vi.fn();
  const utils = renderWithProviders(
    <MontageReviewTimeline
      monitors={[monitor(1, 'Front Door'), monitor(2, 'Driveway East')]}
      rangeStart={RANGE_START}
      rangeEnd={RANGE_END}
      currentTime={new Date('2026-08-21T06:00:00Z')}
      onSeek={onSeek}
      {...over}
    />,
  );
  return { ...utils, onSeek };
}

describe('MontageReviewTimeline — tracks and bars', () => {
  it('renders a track per monitor and a titled bar per recorded event', async () => {
    stubEvents([
      ev(101, 1, '2026-08-21T02:00:00Z', '2026-08-21T02:05:00Z'),
      ev(102, 1, '2026-08-21T09:00:00Z', '2026-08-21T09:30:00Z'),
    ]);
    renderTimeline();

    expect(screen.getByText('Timeline')).toBeInTheDocument();
    expect(screen.getByText('Front Door')).toBeInTheDocument();
    expect(screen.getByText('Driveway East')).toBeInTheDocument();

    // Bars carry `title="<name> — <start>"`.
    await waitFor(() =>
      expect(screen.getByTitle('Event-101 — 2026-08-21T02:00:00Z')).toBeInTheDocument());
    expect(screen.getByTitle('Event-102 — 2026-08-21T09:00:00Z')).toBeInTheDocument();
  });

  it('renders no bars for a monitor with no events', async () => {
    stubEvents([]);
    renderTimeline({ monitors: [monitor(2, 'Driveway East')] });
    await screen.findByText('Driveway East');
    expect(document.querySelectorAll('[title*="—"]')).toHaveLength(0);
  });

  it('skips events that are unparsable or entirely outside the window', async () => {
    stubEvents([
      ev(201, 1, 'not-a-date', null),
      ev(202, 1, '', null),
      ev(203, 1, '2026-08-20T01:00:00Z', '2026-08-20T01:05:00Z'), // before the range
      ev(204, 1, '2026-08-22T01:00:00Z', '2026-08-22T01:05:00Z'), // after the range
      ev(205, 1, '2026-08-21T04:00:00Z', '2026-08-21T04:10:00Z'), // the only keeper
    ]);
    renderTimeline({ monitors: [monitor(1, 'Front Door')] });

    await waitFor(() =>
      expect(screen.getByTitle('Event-205 — 2026-08-21T04:00:00Z')).toBeInTheDocument());
    expect(screen.queryByTitle('Event-201 — not-a-date')).toBeNull();
    expect(screen.queryByTitle('Event-203 — 2026-08-20T01:00:00Z')).toBeNull();
    expect(screen.queryByTitle('Event-204 — 2026-08-22T01:00:00Z')).toBeNull();
  });

  it('an in-progress event (no end) draws a bar running up to now', async () => {
    vi.setSystemTime(new Date('2026-08-21T08:00:00Z'));
    try {
      stubEvents([ev(301, 1, '2026-08-21T07:00:00Z', null)]);
      renderTimeline({ monitors: [monitor(1, 'Front Door')] });
      const bar = await screen.findByTitle('Event-301 — 2026-08-21T07:00:00Z');
      // 1 h of a 12 h window ≈ 8.3 %.
      expect(parseFloat(bar.style.width)).toBeCloseTo(100 / 12, 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clamps a bar that starts before the window to the left edge', async () => {
    stubEvents([ev(401, 1, '2026-08-20T23:00:00Z', '2026-08-21T01:00:00Z')]);
    renderTimeline({ monitors: [monitor(1, 'Front Door')] });
    const bar = await screen.findByTitle('Event-401 — 2026-08-20T23:00:00Z');
    expect(bar.style.left).toBe('0%');
  });

  it('gives a zero-length event a minimum visible width', async () => {
    stubEvents([ev(501, 1, '2026-08-21T03:00:00Z', '2026-08-21T03:00:00Z')]);
    renderTimeline({ monitors: [monitor(1, 'Front Door')] });
    const bar = await screen.findByTitle('Event-501 — 2026-08-21T03:00:00Z');
    expect(parseFloat(bar.style.width)).toBeCloseTo(0.2, 5);
  });

  it('renders high-score events too (max_score over the alarm threshold)', async () => {
    stubEvents([
      ev(601, 1, '2026-08-21T03:00:00Z', '2026-08-21T03:05:00Z', { max_score: 90 }),
      ev(602, 1, '2026-08-21T05:00:00Z', '2026-08-21T05:05:00Z', { max_score: 10 }),
    ]);
    renderTimeline({ monitors: [monitor(1, 'Front Door')] });
    await waitFor(() =>
      expect(screen.getByTitle('Event-601 — 2026-08-21T03:00:00Z')).toBeInTheDocument());
    expect(screen.getByTitle('Event-602 — 2026-08-21T05:00:00Z')).toBeInTheDocument();
  });
});

describe('MontageReviewTimeline — playhead and scrubbing', () => {
  it('positions the playhead at the current time as a percentage of the range', async () => {
    stubEvents([]);
    const { container } = renderTimeline({ currentTime: new Date('2026-08-21T03:00:00Z') });
    await screen.findByText('Front Door');
    // 3 h into a 12 h window = 25 %.
    expect(container.querySelector('[style*="left: 25%"]')).not.toBeNull();
  });

  it('clamps the playhead to 0 % / 100 % when the clock sits outside the range', async () => {
    stubEvents([]);
    const before = renderTimeline({ currentTime: new Date('2026-08-20T00:00:00Z') });
    await screen.findByText('Front Door');
    expect(before.container.querySelector('[style*="left: 0%"]')).not.toBeNull();
    before.unmount();

    const after = renderTimeline({ currentTime: new Date('2026-08-30T00:00:00Z') });
    await screen.findByText('Front Door');
    expect(after.container.querySelector('[style*="left: 100%"]')).not.toBeNull();
  });

  it('a pointer press on the track seeks to that moment', async () => {
    stubEvents([]);
    const spy = stubTrackWidth(1000, 0);
    try {
      const { onSeek, container } = renderTimeline();
      await screen.findByText('Front Door');
      const body = container.querySelector('[style*="touch-action"]') as HTMLElement;
      body.setPointerCapture = vi.fn();

      fireEvent.pointerDown(body, { pointerId: 1, clientX: 250, buttons: 1 });

      expect(body.setPointerCapture).toHaveBeenCalledWith(1);
      expect(onSeek).toHaveBeenCalledTimes(1);
      // 25 % of a 12 h window from 00:00 → 03:00.
      expect(onSeek.mock.calls[0][0]).toEqual(new Date('2026-08-21T03:00:00Z'));
    } finally {
      spy.mockRestore();
    }
  });

  it('dragging with the button held keeps seeking; moving without it does not', async () => {
    stubEvents([]);
    const spy = stubTrackWidth(1000, 0);
    try {
      const { onSeek, container } = renderTimeline();
      await screen.findByText('Front Door');
      const body = container.querySelector('[style*="touch-action"]') as HTMLElement;
      body.setPointerCapture = vi.fn();

      fireEvent.pointerMove(body, { pointerId: 1, clientX: 500, buttons: 0 });
      expect(onSeek).not.toHaveBeenCalled();

      fireEvent.pointerMove(body, { pointerId: 1, clientX: 500, buttons: 1 });
      expect(onSeek).toHaveBeenCalledWith(new Date('2026-08-21T06:00:00Z'));
    } finally {
      spy.mockRestore();
    }
  });

  it('clamps a press past either edge of the track', async () => {
    stubEvents([]);
    const spy = stubTrackWidth(1000, 100);
    try {
      const { onSeek, container } = renderTimeline();
      await screen.findByText('Front Door');
      const body = container.querySelector('[style*="touch-action"]') as HTMLElement;
      body.setPointerCapture = vi.fn();

      fireEvent.pointerDown(body, { pointerId: 1, clientX: 0, buttons: 1 });
      expect(onSeek).toHaveBeenLastCalledWith(RANGE_START);

      fireEvent.pointerDown(body, { pointerId: 1, clientX: 5000, buttons: 1 });
      expect(onSeek).toHaveBeenLastCalledWith(RANGE_END);
    } finally {
      spy.mockRestore();
    }
  });

  it('a zero-width range neither seeks nor divides by zero', async () => {
    stubEvents([]);
    const spy = stubTrackWidth(1000, 0);
    try {
      const { onSeek, container } = renderTimeline({
        rangeStart: RANGE_START,
        rangeEnd: RANGE_START,
        currentTime: RANGE_START,
      });
      await screen.findByText('Front Door');
      const body = container.querySelector('[style*="touch-action"]') as HTMLElement;
      body.setPointerCapture = vi.fn();

      fireEvent.pointerDown(body, { pointerId: 1, clientX: 250, buttons: 1 });
      expect(onSeek).not.toHaveBeenCalled();
      expect(container.querySelector('[style*="left: 0%"]')).not.toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('MontageReviewTimeline — edge labels', () => {
  it('labels a short window with clock times', async () => {
    stubEvents([]);
    renderTimeline({
      rangeStart: new Date('2026-08-21T00:00:00Z'),
      rangeEnd: new Date('2026-08-21T01:00:00Z'),
      currentTime: new Date('2026-08-21T00:30:00Z'),
    });
    await screen.findByText('Front Door');
    // Legacy writes the window's two edges plus the playhead, not a tick row.
    const labels = [...document.querySelectorAll('span')]
      .map((s) => s.textContent ?? '')
      .filter((s) => /^\d{2}:\d{2}$/.test(s));
    expect(labels.length).toBeGreaterThanOrEqual(3);
  });

  it('labels a multi-day window with dates instead of clock times', async () => {
    stubEvents([]);
    renderTimeline({
      rangeStart: new Date('2026-08-01T00:00:00Z'),
      rangeEnd: new Date('2026-08-31T00:00:00Z'),
      currentTime: new Date('2026-08-15T00:00:00Z'),
    });
    await screen.findByText('Front Door');
    // Labels switch to dates past 48 h; the edges carry the window bounds.
    const asDate = (iso: string) =>
      new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
    expect(screen.getByText(asDate('2026-08-01T00:00:00Z'))).toBeInTheDocument();
    expect(screen.getByText(asDate('2026-08-31T00:00:00Z'))).toBeInTheDocument();
    // …and no HH:MM tick survives.
    const clockTicks = [...document.querySelectorAll('span')]
      .map((s) => s.textContent ?? '')
      .filter((s) => /^\d{2}:\d{2}$/.test(s));
    expect(clockTicks).toHaveLength(0);
  });

  it('shows the playhead clock in 24-hour form', async () => {
    stubEvents([]);
    renderTimeline({ currentTime: new Date('2026-08-21T06:00:00Z') });
    await screen.findByText('Front Door');
    const expected = new Date('2026-08-21T06:00:00Z').toLocaleTimeString([], { hour12: false });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});

describe('MontageReviewTimeline — backend trouble', () => {
  it('still renders every track when the events query 500s', async () => {
    server.use(
      http.get('/api/v3/events', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'events table locked' }, { status: 500 }),
      ),
    );
    renderTimeline();
    expect(await screen.findByText('Front Door')).toBeInTheDocument();
    expect(screen.getByText('Driveway East')).toBeInTheDocument();
  });

  it('survives a network failure with empty tracks', async () => {
    server.use(http.get('/api/v3/events', () => HttpResponse.error()));
    renderTimeline();
    expect(await screen.findByText('Front Door')).toBeInTheDocument();
    expect(document.querySelectorAll('[title*="—"]')).toHaveLength(0);
  });
});

/**
 * Legacy `drawEventOnGraph` / `drawFrameOnGraph`: bars in the monitor's own
 * `web_colour` at α .2, scored alarm frames drawn over them, and `#collapse`
 * folding the whole timeline away.
 */
describe('MontageReviewTimeline — legacy fidelity', () => {
  function stubFrames(frames: unknown[]) {
    server.use(http.get('/api/v3/frames', () => paged(frames)));
  }

  it('paints each bar in its monitor\'s web_colour, faintly', async () => {
    stubEvents([ev(9, 1, '2026-08-21T01:00:00Z', '2026-08-21T01:10:00Z')]);
    stubFrames([]);
    renderWithProviders(
      <MontageReviewTimeline
        monitors={[monitor(1, 'Front Door')]}
        rangeStart={RANGE_START}
        rangeEnd={RANGE_END}
        currentTime={RANGE_START}
        onSeek={vi.fn()}
      />,
    );
    const bar = await screen.findByTestId('review-event-bar-9');
    expect(bar.style.backgroundColor).toBe('rgb(67, 188, 242)'); // legacy fallback
    expect(bar.style.opacity).toBe('0.2');
  });

  it('falls back to legacy\'s blue only when the monitor has no colour', async () => {
    stubEvents([ev(9, 1, '2026-08-21T01:00:00Z', '2026-08-21T01:10:00Z')]);
    stubFrames([]);
    renderWithProviders(
      <MontageReviewTimeline
        monitors={[{ ...monitor(1, 'Front Door'), web_colour: '#ff0000' } as Monitor]}
        rangeStart={RANGE_START}
        rangeEnd={RANGE_END}
        currentTime={RANGE_START}
        onSeek={vi.fn()}
      />,
    );
    const bar = await screen.findByTestId('review-event-bar-9');
    expect(bar.style.backgroundColor).toBe('rgb(255, 0, 0)');
  });

  it('shades the scored alarm frames over the bar', async () => {
    stubEvents([ev(9, 1, '2026-08-21T01:00:00Z', '2026-08-21T01:10:00Z', {
      alarm_frames: 2, max_score: 100,
    } as Partial<ZmEvent>)]);
    stubFrames([
      { id: 1, event_id: 9, frame_id: 1, type: 'Alarm', score: 100, time_stamp: '2026-08-21T01:01:00Z', delta: '1.00' },
      { id: 2, event_id: 9, frame_id: 2, type: 'Normal', score: 0, time_stamp: '2026-08-21T01:02:00Z', delta: '2.00' },
    ]);
    renderWithProviders(
      <MontageReviewTimeline
        monitors={[monitor(1, 'Front Door')]}
        rangeStart={RANGE_START}
        rangeEnd={RANGE_END}
        currentTime={RANGE_START}
        onSeek={vi.fn()}
      />,
    );
    const frame = await screen.findByTestId('review-frame-1');
    expect(Number(frame.style.opacity)).toBeCloseTo(0.4, 5);
    // A zero-score frame is not drawn (legacy returns early).
    expect(screen.queryByTestId('review-frame-2')).toBeNull();
  });

  it('asks for no frames when no event scored', async () => {
    const framesFor: string[] = [];
    stubEvents([ev(9, 1, '2026-08-21T01:00:00Z', '2026-08-21T01:10:00Z')]);
    server.use(http.get('/api/v3/frames', ({ request }) => {
      framesFor.push(new URL(request.url).searchParams.get('event_id') ?? '');
      return paged([]);
    }));
    renderWithProviders(
      <MontageReviewTimeline
        monitors={[monitor(1, 'Front Door')]}
        rangeStart={RANGE_START}
        rangeEnd={RANGE_END}
        currentTime={RANGE_START}
        onSeek={vi.fn()}
      />,
    );
    await screen.findByTestId('review-event-bar-9');
    expect(framesFor).toEqual([]);
  });

  it('writes the window edges and the playhead time', async () => {
    stubEvents([]);
    renderTimeline({ currentTime: new Date('2026-08-21T06:00:00Z') });
    await screen.findByText('Front Door');
    // Labels are local wall clock, so compare against the same formatting.
    const hhmm = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    expect(screen.getByTestId('review-timeline-min')).toHaveTextContent(hhmm(RANGE_START));
    expect(screen.getByTestId('review-timeline-max')).toHaveTextContent(hhmm(RANGE_END));
    expect(screen.getByTestId('review-timeline-current'))
      .toHaveTextContent(new Date('2026-08-21T06:00:00Z').toLocaleTimeString([], { hour12: false }));
  });

  it('collapses and restores the tracks', async () => {
    stubEvents([]);
    renderTimeline();
    await screen.findByText('Front Door');
    const toggle = screen.getByRole('button', { name: 'Toggle timeline visibility' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    await waitFor(() => expect(screen.queryByText('Front Door')).toBeNull());
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(await screen.findByText('Front Door')).toBeInTheDocument();
  });
});
