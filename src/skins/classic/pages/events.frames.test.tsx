/**
 * Integration-style tests for the legacy `?view=frames` page (classic skin).
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({}),
  useNavigate: () => mockNavigate,
  Link: ({
    children, to, params,
    ...rest
  }: {
    children: React.ReactNode;
    to?: string;
    params?: Record<string, string>;
    [k: string]: unknown;
  }) => {
    const href = Object.entries(params ?? {}).reduce(
      (acc, [k, v]) => acc.replace(`$${k}`, v),
      to ?? '#',
    );
    return <a href={href} {...rest}>{children}</a>;
  },
}));

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  mockNavigate.mockReset();
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

async function mount() {
  const { default: Page } = await import('./events.frames');
  return renderWithProviders(<Page eventId={42} />);
}

function frame(frame_id: number, over: Record<string, unknown> = {}) {
  return {
    id: 1000 + frame_id, event_id: 42, frame_id, type: 'Normal', score: 0,
    time_stamp: `2026-06-03T12:00:${String(frame_id).padStart(2, '0')}Z`,
    delta: (frame_id * 0.5).toFixed(3), ...over,
  };
}

function stubEndpoints(frames = [frame(1), frame(2, { type: 'Alarm', score: 37 }), frame(3, { score: 12 })]) {
  server.use(
    http.get('/api/v3/events/:id', () =>
      HttpResponse.json({ id: 42, monitor_id: 1, storage_id: 1, name: 'Front Door Motion' }),
    ),
    http.get('/api/v3/frames', () =>
      HttpResponse.json({
        items: frames, total: 60, per_page: 25, current_page: 1, last_page: 3,
      }),
    ),
    http.get('/api/v3/configs/:name', () =>
      HttpResponse.json({ name: 'ZM_WEB_EVENTS_PER_PAGE', value: '25', type: 'string' }),
    ),
  );
}

describe('EventFramesPage — classic skin', () => {
  it('renders the legacy column set, the alarm row and the back link', async () => {
    stubEndpoints();
    await mount();
    await waitFor(() => expect(screen.getByTestId('frames-table')).toBeInTheDocument());

    expect(
      screen.getByRole('heading', { level: 1, name: /frames — event 42/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to event/i }).getAttribute('href')).toBe('/events/42');

    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual([
      'Event Id', 'Frame Id', 'Type', 'Time Stamp', 'Time Delta', 'Score', 'Thumbnail',
    ]);

    const alarmRow = screen.getByTestId('frame-row-2');
    expect(alarmRow.getAttribute('data-frame-type')).toBe('Alarm');
    expect(alarmRow.className).toMatch(/f8d7da/);
    expect(within(alarmRow).getByText('Alarm')).toBeInTheDocument();
    expect(within(alarmRow).getByText('37')).toBeInTheDocument();
    expect(within(alarmRow).getByText('1.00')).toBeInTheDocument();

    const normalRow = screen.getByTestId('frame-row-1');
    expect(normalRow.className).not.toMatch(/f8d7da/);
  });

  it('marks every thumbnail cell as blocked on zm-api#26', async () => {
    stubEndpoints();
    await mount();
    await waitFor(() => expect(screen.getByTestId('frames-table')).toBeInTheDocument());

    const notes = screen.getAllByText('needs zm-api#26');
    expect(notes).toHaveLength(3);
    expect(notes[0].closest('td')?.getAttribute('title')).toBe(
      'Per-frame images are not served by the API yet.',
    );
  });

  it('pages through the URL', async () => {
    stubEndpoints();
    await mount();
    await waitFor(() => expect(screen.getByTestId('frames-table')).toBeInTheDocument());

    expect(screen.getByText('Showing 1 to 3 of 60 rows')).toBeInTheDocument();
    screen.getByRole('button', { name: /next page/i }).click();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    const call = mockNavigate.mock.calls[0][0] as {
      search: (p: Record<string, unknown>) => Record<string, unknown>; replace?: boolean;
    };
    expect(call.replace).toBe(true);
    expect(call.search({})).toEqual({ page: 2 });
  });

  it('renders the backend error instead of an empty table', async () => {
    stubEndpoints();
    server.use(
      http.get('/api/v3/frames', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'frames table locked' }, { status: 500 }),
      ),
    );
    await mount();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/cannot reach the server/i);
    expect(screen.queryByTestId('frames-table')).toBeNull();
  });
});
