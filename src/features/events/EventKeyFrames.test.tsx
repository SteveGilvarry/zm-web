/**
 * The two stills legacy shows under the event stats table (`event.php:313-334`).
 */
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { EventKeyFrames } from './EventKeyFrames';

// `useZmConfig` reads the whole table once rather than a row at a time.
const server = setupServer(
  http.get('/api/v3/configs', () =>
    HttpResponse.json({
      items: [{ id: 1, name: 'ZM_WEB_LIST_THUMB_WIDTH', value: '64', type: 'integer' }],
      total: 1, per_page: 1000, current_page: 1, last_page: 1,
    }),
  ),
);
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'tok', refreshToken: 'tok', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

describe('EventKeyFrames', () => {
  it('asks for fid=alarm and fid=snapshot at the configured thumb width', async () => {
    renderWithProviders(<EventKeyFrames eventId={42} />);

    const alarm = screen.getByTestId('event-frame-alarm');
    expect(alarm).toHaveAttribute('src', '/api/v3/events/42/frames/alarm/image?token=tok');
    expect(alarm).toHaveAttribute('alt', 'First alarmed frame');
    expect(screen.getByTestId('event-frame-snapshot')).toHaveAttribute(
      'src', '/api/v3/events/42/frames/snapshot/image?token=tok',
    );
    // ZM_WEB_LIST_THUMB_WIDTH, the same row the events list reads.
    await waitFor(() => expect(alarm).toHaveAttribute('width', '64'));
  });

  it('links each still to its full-size image', () => {
    renderWithProviders(<EventKeyFrames eventId={7} />);
    expect(screen.getByTestId('event-frame-snapshot').closest('a')).toHaveAttribute(
      'href', '/api/v3/events/7/frames/snapshot/image?token=tok',
    );
  });

  it('drops a still that 404s, and renders nothing once both are gone', async () => {
    renderWithProviders(<EventKeyFrames eventId={42} />);

    // An event with no alarm frame 404s on fid=alarm but still has a snapshot.
    fireEvent.error(screen.getByTestId('event-frame-alarm'));
    await waitFor(() => expect(screen.queryByTestId('event-frame-alarm')).toBeNull());
    expect(screen.getByTestId('event-frame-snapshot')).toBeInTheDocument();

    // An install that records video only has neither.
    fireEvent.error(screen.getByTestId('event-frame-snapshot'));
    await waitFor(() => expect(screen.queryByTestId('event-key-frames')).toBeNull());
  });

  it('leaves objdetect out — legacy shows it, zm-web deliberately does not', () => {
    renderWithProviders(<EventKeyFrames eventId={42} />);
    expect(screen.queryByTestId('event-frame-objdetect')).toBeNull();
  });
});
