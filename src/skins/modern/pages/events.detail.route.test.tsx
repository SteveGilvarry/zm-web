/**
 * Event detail through the real router.
 *
 * `events.detail.test.tsx` mounts the page with a stubbed router and covers
 * the metadata, notes and tag round-trips. This file adds the states and
 * controls it cannot reach: the loading / error / not-found returns, the
 * player transport, the Event_Data frame links, and the read-only tag view an
 * operator without `events: Edit` gets.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeEvent, makeTag, paginated } from '@/test/fixtures';

setupMockServer();

/** The <video> the page renders once the event has loaded. */
async function player(): Promise<HTMLVideoElement> {
  await screen.findAllByRole('heading', { name: 'Event-101' });
  const video = document.querySelector('video');
  expect(video).not.toBeNull();
  return video as HTMLVideoElement;
}

describe('Event detail — load states', () => {
  it('renders the event once it arrives', async () => {
    renderRoute('/events/101');
    expect(await screen.findAllByRole('heading', { name: 'Event-101' })).not.toHaveLength(0);
    expect(screen.getByText('Motion')).toBeInTheDocument();
  });

  it('shows the error state when the event request fails', async () => {
    server.use(http.get('/api/v3/events/:id', () => new HttpResponse(null, { status: 500 })));
    renderRoute('/events/101');
    expect(await screen.findAllByRole('heading', { name: /^Event$/ })).not.toHaveLength(0);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('shows a not-found panel for an id the backend does not have', async () => {
    server.use(http.get('/api/v3/events/:id', () => HttpResponse.json(null)));
    renderRoute('/events/999');
    expect(await screen.findAllByRole('heading', { name: /Event Not Found/i })).not.toHaveLength(0);
  });
});

describe('Event detail — player transport', () => {
  it('tracks the video element through its own events', async () => {
    renderRoute('/events/101');
    const video = await player();

    // jsdom never fires these itself — the page's handlers are the contract.
    Object.defineProperty(video, 'duration', { value: 600, configurable: true });
    fireEvent.loadedMetadata(video);
    Object.defineProperty(video, 'currentTime', { value: 42, writable: true, configurable: true });
    fireEvent.timeUpdate(video);

    expect(await screen.findByText(/0:42 \/ 10:00/)).toBeInTheDocument();
  });

  it('flips the play control between Play and Pause with the element state', async () => {
    renderRoute('/events/101');
    const video = await player();

    expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument();
    fireEvent.play(video);
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument();
    fireEvent.pause(video);
    expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument();
    fireEvent.ended(video);
    expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('skips backwards and forwards by ten seconds', async () => {
    const user = userEvent.setup();
    renderRoute('/events/101');
    const video = await player();

    Object.defineProperty(video, 'duration', { value: 600, configurable: true });
    fireEvent.loadedMetadata(video);
    Object.defineProperty(video, 'currentTime', { value: 100, writable: true, configurable: true });
    fireEvent.timeUpdate(video);

    await user.click(await screen.findByRole('button', { name: 'Forward 10 seconds' }));
    expect(video.currentTime).toBe(110);

    await user.click(screen.getByRole('button', { name: 'Back 10 seconds' }));
    expect(video.currentTime).toBe(100);
  });

  it('keeps the chosen playback scale', async () => {
    const user = userEvent.setup();
    renderRoute('/events/101');
    await player();

    const scale = screen.getByRole('combobox', { name: 'Scale' });
    await user.selectOptions(scale, '50');
    expect(scale).toHaveValue('50');
  });
});

describe('Event detail — Event_Data', () => {
  it('lists detector rows and seeks the player from a frame link', async () => {
    server.use(
      http.get('/api/v3/event-data', () =>
        HttpResponse.json(
          paginated(
            [{
              id: 1,
              event_id: 101,
              monitor_id: 1,
              frame_id: 300,
              timestamp: '2026-08-21T09:00:20Z',
              data: 'person 0.94',
            }],
            { total: 1 },
          ),
        ),
      ),
    );

    const user = userEvent.setup();
    renderRoute('/events/101');
    const video = await player();
    Object.defineProperty(video, 'duration', { value: 600, configurable: true });
    fireEvent.loadedMetadata(video);

    const table = await screen.findByTestId('event-data-table');
    expect(within(table).getByText('person 0.94')).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: '#300' }));
    // 9000 frames over 600s = 15fps, so frame 300 is 20s in.
    expect(video.currentTime).toBeCloseTo(20, 3);
  });

  it('omits the Event Data panel when nothing wrote any', async () => {
    renderRoute('/events/101');
    await player();
    expect(screen.queryByTestId('event-data-table')).not.toBeInTheDocument();
  });
});

describe('Event detail — permissions', () => {
  it('shows tags read-only without events Edit', async () => {
    db.events = [makeEvent({ id: 101, name: 'Event-101', tags: [{ id: 1, name: 'Important' }] })];
    renderRoute('/events/101', { perms: { events: 'View' } });
    await screen.findAllByRole('heading', { name: 'Event-101' });

    expect(await screen.findByText('Important')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/add tag/i)).not.toBeInTheDocument();
  });

  it('offers the tag editor with events Edit', async () => {
    db.tags = [makeTag({ id: 1, name: 'Important' })];
    db.events = [makeEvent({ id: 101, name: 'Event-101', tags: [] })];
    renderRoute('/events/101');
    await screen.findAllByRole('heading', { name: 'Event-101' });

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/add tag/i)).toBeInTheDocument(),
    );
  });
});
