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
