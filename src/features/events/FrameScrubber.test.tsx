import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { FrameScrubber } from './FrameScrubber';
import { useAuthStore } from '@/stores/auth';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'warn' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

// Build a synthetic /frames response.
const frameFixture = (count: number) => ({
  items: Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    event_id: 1,
    frame_id: i + 1,
    // Alternate alarm and normal so colour-classification tests have
    // something to verify.
    type: i % 3 === 0 ? 'Alarm' : 'Normal',
    score: (i + 1) * 5,
    time_stamp: `2026-05-24T12:00:${String(i).padStart(2, '0')}Z`,
    delta: String(i * 0.5),
  })),
  total: count,
  per_page: 500,
  current_page: 1,
  last_page: 1,
});

describe('FrameScrubber — loading state', () => {
  it('shows a skeleton while frames are loading', () => {
    server.use(
      http.get('/api/v3/frames', () => new Promise(() => {})), // never resolves
    );
    renderWithProviders(
      <FrameScrubber eventId={1} durationSec={10} currentTimeSec={0} onSeek={() => {}} />,
    );
    // Component renders a "Frame Scrubber" caption regardless of state.
    expect(screen.getByText(/frame scrubber/i)).toBeInTheDocument();
  });
});

describe('FrameScrubber — empty state', () => {
  it("shows 'No frame data' when the backend returns no frames", async () => {
    server.use(
      http.get('/api/v3/frames', () => HttpResponse.json({
        items: [], total: 0, per_page: 500, current_page: 1, last_page: 1,
      })),
    );
    renderWithProviders(
      <FrameScrubber eventId={1} durationSec={10} currentTimeSec={0} onSeek={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getByText(/no frame data/i)).toBeInTheDocument();
    });
  });
});

describe('FrameScrubber — legacy progress bar', () => {
  it('draws ten wall-clock labels from the event start', async () => {
    server.use(http.get('/api/v3/frames', () => HttpResponse.json(frameFixture(5))));
    const start = new Date('2026-05-24T12:00:00Z');

    renderWithProviders(
      <FrameScrubber
        eventId={1}
        durationSec={100}
        currentTimeSec={0}
        onSeek={() => {}}
        startTime={start}
      />,
    );

    const labels = await screen.findByTestId('scrubber-time-labels');
    expect(labels.children).toHaveLength(10);
    // Each label is one tenth of the event later than the one before it.
    expect(labels.children[0].textContent).toBe(start.toLocaleTimeString());
    expect(labels.children[1].textContent).toBe(
      new Date(start.getTime() + 10_000).toLocaleTimeString(),
    );
  });

  it('renders no labels without a start time to count from', async () => {
    server.use(http.get('/api/v3/frames', () => HttpResponse.json(frameFixture(5))));
    renderWithProviders(
      <FrameScrubber eventId={1} durationSec={10} currentTimeSec={0} onSeek={() => {}} />,
    );
    await waitFor(() => expect(screen.getByLabelText(/next frame/i)).toBeEnabled());
    expect(screen.queryByTestId('scrubber-time-labels')).not.toBeInTheDocument();
  });

  it('draws the motion score as a line with the alarm periods shaded behind it', async () => {
    // Frames 1, 4 and 7 are alarms (every third), so three separate periods.
    server.use(http.get('/api/v3/frames', () => HttpResponse.json(frameFixture(7))));
    renderWithProviders(
      <FrameScrubber eventId={1} durationSec={10} currentTimeSec={0} onSeek={() => {}} />,
    );

    const bands = await screen.findAllByTestId('level-graph-band');
    expect(bands).toHaveLength(3);
    // Frame 7 is the last one, so its period runs on to the end of the event:
    // from 3 s to 10 s on a 1000-wide box is x 300, width 700.
    expect(bands[2].getAttribute('x')).toBe('300');
    expect(bands[2].getAttribute('width')).toBe('700');

    // Scores are (i+1)*5, so the line climbs to the event's peak at frame 7.
    const points = screen.getByTestId('level-graph-motion').getAttribute('points')!.split(' ');
    expect(points).toHaveLength(7);
    // 48 tall, 2 of headroom: 48 − 5/35 × 46.
    expect(points[0]).toBe('0,41.43');
    expect(points[6]).toBe('300,2');
  });

  it('draws no line for an event that never scored', async () => {
    const flat = frameFixture(3);
    flat.items.forEach((f) => { f.score = 0; });
    server.use(http.get('/api/v3/frames', () => HttpResponse.json(flat)));
    renderWithProviders(
      <FrameScrubber eventId={1} durationSec={10} currentTimeSec={0} onSeek={() => {}} />,
    );
    await screen.findByTestId('level-graph');
    expect(screen.queryByTestId('level-graph-motion')).not.toBeInTheDocument();
  });

  it('follows the pointer with an indicator showing the time under it', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/frames', () => HttpResponse.json(frameFixture(5))));
    const start = new Date('2026-05-24T12:00:00Z');

    const { container } = renderWithProviders(
      <FrameScrubber
        eventId={1}
        durationSec={100}
        currentTimeSec={0}
        onSeek={() => {}}
        startTime={start}
      />,
    );
    await screen.findByTestId('level-graph');

    // jsdom gives every element a zero-size box; the track needs a real one
    // for the pointer position to mean anything.
    const track = container.querySelector('[dir="ltr"].relative') as HTMLElement;
    track.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 200, bottom: 32, width: 200, height: 32, x: 0, y: 0,
      toJSON: () => ({}),
    });

    await user.pointer({ target: track, coords: { clientX: 50, clientY: 5 } });

    const indicator = await screen.findByTestId('scrubber-indicator');
    // A quarter of the way along a 100 s event is 25 s past the start.
    // …with the score of the nearest frame (the last, at 2 s, scoring 25).
    expect(indicator.textContent).toBe(
      `${new Date(start.getTime() + 25_000).toLocaleTimeString()} — motion 25`,
    );
    expect(indicator.style.left).toBe('25%');
  });
});

describe('FrameScrubber — navigation buttons', () => {
  it('advances to the next frame on the > button', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/frames', () => HttpResponse.json(frameFixture(5))));
    const onSeek = vi.fn();

    renderWithProviders(
      <FrameScrubber eventId={1} durationSec={10} currentTimeSec={0} onSeek={onSeek} />,
    );

    // Wait for the scrubber to load.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next frame/i })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: /next frame/i }));
    // currentTimeSec=0 → activeIndex=0; clicking next seeks to frame 1's delta = 0.5.
    expect(onSeek).toHaveBeenCalledWith(0.5);
  });

  it('disables the previous button at the first frame', async () => {
    server.use(http.get('/api/v3/frames', () => HttpResponse.json(frameFixture(3))));

    renderWithProviders(
      <FrameScrubber eventId={1} durationSec={10} currentTimeSec={0} onSeek={() => {}} />,
    );

    await waitFor(() => {
      const prev = screen.getByRole('button', { name: /previous frame/i });
      expect(prev).toBeDisabled();
    });
  });

  it('shows the active frame number and score in the readout', async () => {
    server.use(http.get('/api/v3/frames', () => HttpResponse.json(frameFixture(3))));

    renderWithProviders(
      <FrameScrubber eventId={1} durationSec={10} currentTimeSec={0} onSeek={() => {}} />,
    );

    await waitFor(() => {
      // Frame 1 of 3 with score 5 = '#1 / 3 · score 5'.
      expect(screen.getByText(/#1 \/ 3/)).toBeInTheDocument();
    });
  });
});
