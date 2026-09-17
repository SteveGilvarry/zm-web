import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import type { ZmEvent } from '@/types';
import { EventCauseCell } from './EventCauseCell';

const server = setupServer();

const ALL_EDIT = {
  iat: 0, exp: 0, user: 'admin',
  perms: {
    stream: 'Edit', events: 'Edit', control: 'Edit', monitors: 'Edit',
    groups: 'Edit', devices: 'Edit', snapshots: 'Edit', system: 'Edit',
  },
};
const VIEW_ONLY = { ...ALL_EDIT, perms: { ...ALL_EDIT.perms, events: 'View' } };

function signIn(user: unknown = ALL_EDIT) {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', isAuthenticated: true, user: user as never,
  });
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

function makeEvent(over: Partial<ZmEvent> = {}): ZmEvent {
  return {
    id: 7, monitor_id: 1, storage_id: 1, name: 'Event-7', cause: 'Motion',
    start_date_time: '2026-09-01T10:00:00Z', end_date_time: null,
    width: 1920, height: 1080, length: 10, frames: 30, alarm_frames: 2,
    default_video: '', tot_score: 0, avg_score: 0, max_score: 0,
    archived: 0, videoed: 0, uploaded: 0, emailed: 0, messaged: 0, executed: 0,
    notes: null, state_id: 1, orientation: 'ROTATE_0', disk_space: 0,
    scheme: 'Deep', locked: 0, tags: null, ...over,
  } as ZmEvent;
}

describe('EventCauseCell', () => {
  it('opens the event-detail editor from the cause and saves it', async () => {
    signIn();
    const user = userEvent.setup();
    let patched: unknown = null;
    server.use(http.patch('/api/v3/events/7', async ({ request }) => {
      patched = await request.json();
      return HttpResponse.json(makeEvent({ cause: 'Forced' }));
    }));

    renderWithProviders(<EventCauseCell event={makeEvent({ notes: 'parcel at door' })} />);
    await user.click(screen.getByRole('button', { name: 'Motion' }));

    const form = await screen.findByTestId('event-edit-form');
    expect(form).toBeInTheDocument();
    const cause = screen.getByLabelText('Cause');
    await user.clear(cause);
    await user.type(cause, 'Forced');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patched).toMatchObject({ cause: 'Forced' }));
  });

  it('prints the notes under the cause, but not the Forced Web placeholder', () => {
    signIn();
    const { unmount } = renderWithProviders(
      <EventCauseCell event={makeEvent({ notes: 'parcel at door' })} />,
    );
    expect(screen.getByText('parcel at door')).toBeInTheDocument();
    unmount();

    renderWithProviders(<EventCauseCell event={makeEvent({ notes: 'Forced Web: ' })} />);
    expect(screen.queryByText('Forced Web: ')).toBeNull();
  });

  it('opens the object-detection view for a detected: note', async () => {
    signIn();
    const user = userEvent.setup();
    server.use(http.get('/api/v3/event-data', () => HttpResponse.json({
      items: [{ id: 1, event_id: 7, frame_id: 12, data: 'person 0.91' }],
      total: 1, per_page: 200, current_page: 1, last_page: 1,
    })));

    renderWithProviders(<EventCauseCell event={makeEvent({ notes: 'detected:person(91%)' })} />);
    await user.click(screen.getByRole('button', { name: 'detected:person(91%)' }));

    expect(await screen.findByTestId('objdetect-modal')).toBeInTheDocument();
    expect(await screen.findByText('person 0.91')).toBeInTheDocument();
    expect(screen.getByText('Frame 12')).toBeInTheDocument();
  });

  it('says so when the detector left no data behind', async () => {
    signIn();
    const user = userEvent.setup();
    server.use(http.get('/api/v3/event-data', () => HttpResponse.json({
      items: [], total: 0, per_page: 200, current_page: 1, last_page: 1,
    })));

    renderWithProviders(<EventCauseCell event={makeEvent({ notes: 'detected:car' })} />);
    await user.click(screen.getByRole('button', { name: 'detected:car' }));
    expect(await screen.findByText('No detection data recorded for this event.')).toBeInTheDocument();
  });

  it('is plain text for a user who cannot edit events', () => {
    signIn(VIEW_ONLY);
    renderWithProviders(<EventCauseCell event={makeEvent()} />);
    expect(screen.queryByRole('button', { name: 'Motion' })).toBeNull();
    expect(screen.getByText('Motion')).toBeInTheDocument();
  });
});
