/**
 * Integration-style tests for the legacy `?view=frames` page (classic skin).
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';

const mockNavigate = vi.fn();
/** Whether the router has an entry behind this page — legacy's `document.referrer`. */
let canGoBack = true;
vi.mock('@tanstack/react-router', () => ({
  useCanGoBack: () => canGoBack,
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
  server.listen({ onUnhandledFrame: 'error' });
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
    event_id: 42, frame_id, type: 'Normal', score: 0, audio_level: 0,
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
  it('renders the legacy column set, the alarm row and a history Back', async () => {
    stubEndpoints();
    await mount();
    await waitFor(() => expect(screen.getByTestId('frames-table')).toBeInTheDocument());

    expect(
      screen.getByRole('heading', { level: 1, name: /frames — event 42/i }),
    ).toBeInTheDocument();
    // Legacy's Back is `history.back()`.
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    screen.getByRole('button', { name: 'Back' }).click();
    expect(back).toHaveBeenCalled();
    back.mockRestore();

    // Event Id is hidden by default, as it is in legacy's frames table.
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual([
      'Frame Id', 'Type', 'Time Stamp', 'Time Delta', 'Score', 'Thumbnail',
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

  it('greys Back when there is nowhere to go back to, as legacy does', async () => {
    canGoBack = false;
    try {
      stubEndpoints();
      await mount();
      await waitFor(() => expect(screen.getByTestId('frames-table')).toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    } finally {
      canGoBack = true;
    }
  });

  it('draws a thumbnail per row from /frames/{id}/image', async () => {
    stubEndpoints();
    await mount();
    await waitFor(() => expect(screen.getByTestId('frames-table')).toBeInTheDocument());

    // Fetched by event and frame number (`Frames.Id` is gone in 1.39.36).
    const thumbs = screen.getAllByTestId(/^frame-thumb-/);
    expect(thumbs).toHaveLength(3);
    expect(thumbs[0]).toHaveAttribute(
      'src', '/api/v3/events/42/frames/1/image?token=test',
    );
    expect(thumbs[0]).toHaveAttribute('alt', 'Frame 1');
  });

  it('falls back to a dash when the frame has no stored image', async () => {
    stubEndpoints();
    await mount();
    await waitFor(() => expect(screen.getByTestId('frames-table')).toBeInTheDocument());

    // jsdom never loads images, so drive the same error the 404 would.
    const thumb = screen.getAllByTestId(/^frame-thumb-/)[0];
    const cell = thumb.closest('td')!;
    fireEvent.error(thumb);
    await waitFor(() => expect(within(cell).queryByTestId(/^frame-thumb-/)).toBeNull());
    expect(cell).toHaveTextContent('—');
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

describe('EventFramesPage — classic toolbar', () => {
  it('searches the rows on screen', async () => {
    const user = userEvent.setup();
    stubEndpoints();
    await mount();
    await waitFor(() => expect(screen.getByTestId('frames-table')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Search frames'), 'Alarm');

    await waitFor(() => expect(screen.queryByTestId('frame-row-1')).toBeNull());
    expect(screen.getByTestId('frame-row-2')).toBeInTheDocument();
  });

  it('sorts on a column header and flips it on a second click', async () => {
    const user = userEvent.setup();
    stubEndpoints();
    await mount();
    await waitFor(() => expect(screen.getByTestId('frames-table')).toBeInTheDocument());

    const rowIds = () => screen.getAllByTestId(/^frame-row-/).map((r) => r.getAttribute('data-testid'));
    await user.click(screen.getByRole('button', { name: /^Score/ }));
    expect(rowIds()).toEqual(['frame-row-1', 'frame-row-3', 'frame-row-2']);

    await user.click(screen.getByRole('button', { name: /^Score/ }));
    expect(rowIds()).toEqual(['frame-row-2', 'frame-row-3', 'frame-row-1']);
    expect(screen.getByRole('columnheader', { name: /^Score/ })).toHaveAttribute('aria-sort', 'descending');
  });

  it('shows and hides columns from the chooser', async () => {
    const user = userEvent.setup();
    stubEndpoints();
    await mount();
    await waitFor(() => expect(screen.getByTestId('frames-table')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(within(screen.getByTestId('frames-column-chooser')).getByRole('button', { name: 'Event Id' }));

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Event Id', 'Frame Id', 'Type', 'Time Stamp', 'Time Delta', 'Score', 'Thumbnail',
    ]);
  });

  it('exports the visible rows and refreshes on demand', async () => {
    const user = userEvent.setup();
    stubEndpoints();
    let fetches = 0;
    server.use(http.get('/api/v3/frames', () => {
      fetches += 1;
      return HttpResponse.json({
        items: [frame(1)], total: 60, per_page: 25, current_page: 1, last_page: 3,
      });
    }));
    await mount();
    await waitFor(() => expect(screen.getByTestId('frames-table')).toBeInTheDocument());

    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(click).toHaveBeenCalled();
    expect(await (created.mock.calls[0][0] as Blob).text()).toContain('Frame Id,Type');

    const before = fetches;
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(fetches).toBeGreaterThan(before));

    vi.restoreAllMocks();
  });

  it('offers All as a page size', async () => {
    const user = userEvent.setup();
    stubEndpoints();
    await mount();
    await waitFor(() => expect(screen.getByTestId('frames-table')).toBeInTheDocument());

    const select = screen.getByLabelText('Rows per page') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['10', '25', '50', '100', '200', 'All']);

    await user.selectOptions(select, '0');
    const call = mockNavigate.mock.calls.at(-1)![0] as {
      search: (p: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(call.search({ page: 3 })).toEqual({ page_size: 0 });
  });
});

describe('EventFramesPage — classic stats and frame links', () => {
  function stubStats() {
    const seen: string[] = [];
    server.use(
      http.get('/api/v3/events/:id', () =>
        HttpResponse.json({ id: 42, monitor_id: 1, storage_id: 1, name: 'Front Door Motion', width: 640, height: 480 }),
      ),
      http.get('/api/v3/monitors/:id/zones', () =>
        HttpResponse.json({
          items: [{ id: 3, monitor_id: 1, name: 'Driveway', area: 5000, coords: '0,0 50,0 50,100 0,100' }],
          total: 1, per_page: 100, current_page: 1, last_page: 1,
        }),
      ),
      http.get('/api/v3/stats', ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({
          items: [{
            id: 9, monitor_id: 1, zone_id: 3, event_id: 42, frame_id: 2,
            pixel_diff: 25, alarm_pixels: 15360, filter_pixels: 10000, blob_pixels: 9999, blobs: 2,
            min_blob_size: 1000, max_blob_size: 8000, min_x: 12, max_x: 300, min_y: 34, max_y: 400, score: 37,
          }],
          total: 1, per_page: 100, current_page: 1, last_page: 1,
        });
      }),
    );
    return seen;
  }

  it('opens the frame\'s stats under its row from the "+"', async () => {
    const user = userEvent.setup();
    stubEndpoints();
    const seen = stubStats();
    await mount();
    await waitFor(() => expect(screen.getByTestId('frames-table')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Show stats for frame 2' }));
    const table = await screen.findByTestId('frame-stats-2');
    expect(within(table).getByText('Stats - 42 - 2')).toBeInTheDocument();
    const row = await within(table).findByTestId('stats-row-3');
    expect(within(row).getByText('Driveway')).toBeInTheDocument();
    expect(within(row).getByText('15360 (10%)')).toBeInTheDocument();
    expect(within(row).getByText('1000-8000 (0%-5%)')).toBeInTheDocument();
    expect(seen[0]).toContain('event_id=42');
    expect(seen[0]).toContain('frame_id=2');
    // The "+" does not also open the frame.
    expect(mockNavigate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Hide stats for frame 2' }));
    expect(screen.queryByTestId('frame-detail-2')).not.toBeInTheDocument();
  });

  it('opens the stats page from Score and the frame from anywhere else on the row', async () => {
    const user = userEvent.setup();
    stubEndpoints();
    await mount();
    await waitFor(() => expect(screen.getByTestId('frames-table')).toBeInTheDocument());

    await user.click(screen.getByTestId('frame-score-2'));
    expect(mockNavigate).toHaveBeenLastCalledWith({
      to: '/events/$eventId/stats', params: { eventId: '42' }, search: { fid: 2 },
    });

    await user.click(within(screen.getByTestId('frame-row-3')).getByText('Normal'));
    expect(mockNavigate).toHaveBeenLastCalledWith({
      to: '/events/$eventId/frames/$frameId', params: { eventId: '42', frameId: '3' },
    });
  });
});

describe('EventFramesPage — classic card view and fullscreen', () => {
  it('stacks each row as label / value pairs, and back', async () => {
    const user = userEvent.setup();
    stubEndpoints();
    await mount();
    await waitFor(() => expect(screen.getByTestId('frames-table')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Show card view' }));
    expect(screen.queryAllByRole('columnheader')).toHaveLength(0);
    const row = screen.getByTestId('frame-row-2');
    expect(row).toHaveTextContent('Frame Id2');
    expect(row).toHaveTextContent('TypeAlarm');
    // Score still opens the stats page in card view.
    await user.click(screen.getByTestId('frame-score-2'));
    expect(mockNavigate).toHaveBeenLastCalledWith(expect.objectContaining({ to: '/events/$eventId/stats' }));

    await user.click(screen.getByRole('button', { name: 'Hide card view' }));
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0);
  });

  it('fullscreens the table', async () => {
    const user = userEvent.setup();
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      value: requestFullscreen, configurable: true, writable: true,
    });
    stubEndpoints();
    await mount();
    await waitFor(() => expect(screen.getByTestId('frames-table')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Fullscreen' }));
    expect(requestFullscreen).toHaveBeenCalled();
    expect(requestFullscreen.mock.contexts[0]).toContainElement(screen.getByTestId('frames-table'));
  });
});
