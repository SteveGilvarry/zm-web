/**
 * Classic Timeline against legacy `timeline.php`: toolbar (Back, Refresh,
 * List, "Timeline"), the tips, one readout per monitor, Pan Left / Zoom
 * Out / Pan Right, the bars in each monitor's colour, the Zoom In bands,
 * the key and the range line.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { makeEvent, makeMonitor } from '@/test/fixtures';

let mockSearch: Record<string, unknown> = {};
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mockSearch,
  useNavigate: () => mockNavigate,
  Link: ({ children, to, search, ...rest }: { children: React.ReactNode; to: string; search?: Record<string, unknown>; [k: string]: unknown }) => {
    const qs = search ? `?${new URLSearchParams(Object.entries(search).map(([k, v]) => [k, String(v)])).toString()}` : '';
    return <a href={`${to}${qs}`} {...rest}>{children}</a>;
  },
}));
vi.mock('@/features/nav/useCanGoBack', () => ({ useCanGoBack: () => false }));
vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const at = (h: number, m: number, s = 0) => Math.floor(new Date(2026, 7, 21, h, m, s).getTime() / 1000);
const iso = (t: number) => new Date(t * 1000).toISOString();
const paged = <T,>(items: T[]) => ({ items, total: items.length, per_page: 1000, current_page: 1, last_page: 1 });

const events = [
  makeEvent({ id: 31, monitor_id: 1, name: 'Event-31', cause: 'Motion', length: '60.00', start_date_time: iso(at(14, 10)), end_date_time: iso(at(14, 11)), max_score: 50, notes: 'person' }),
  makeEvent({ id: 32, monitor_id: 2, name: 'Event-32', cause: 'Forced Web', length: '30.00', start_date_time: iso(at(15, 0)), end_date_time: iso(at(15, 0, 30)), max_score: 0, archived: 1 }),
];

const server = setupServer(
  http.get('/api/v3/monitors', () => HttpResponse.json(paged([
    makeMonitor({ id: 1, name: 'Front', web_colour: '#ff0000' }),
    makeMonitor({ id: 2, name: 'Back', web_colour: '#0000ff' }),
  ]))),
  http.get('/api/v3/frames', () => HttpResponse.json(paged([]))),
  http.post('/api/v3/filters/preview', () => HttpResponse.json(paged(events))),
);

beforeAll(() => {
  useAuthStore.setState({ accessToken: 'tok', refreshToken: 'r', user: null, isAuthenticated: true });
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => { server.resetHandlers(); mockSearch = {}; mockNavigate.mockReset(); });
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

async function mount() {
  const { default: Page } = await import('./timeline');
  return renderWithProviders(<Page />);
}

describe('classic timeline', () => {
  it('draws legacy’s toolbar, readouts, navigation, chart, key and range', async () => {
    mockSearch = { archived: true, min_time: '2026-08-21 14:00:00', max_time: '2026-08-21 15:59:59' };
    await mount();
    expect(await screen.findByTestId('timeline-chart')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Timeline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'List' })).toHaveAttribute(
      'href', '/events?archived=true&start=2026-08-21T14%3A00%3A00&end=2026-08-21T15%3A59%3A59',
    );
    for (const name of ['Pan Left', 'Zoom Out', 'Pan Right']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }

    // Readouts replace the tips as soon as each monitor shows its first event.
    expect(screen.queryByText(/Pass your mouse over the graph/)).not.toBeInTheDocument();
    const front = screen.getByTestId('timeline-data-1');
    expect(within(front).getByText('Front')).toBeInTheDocument();
    expect(within(front).getByText('Event-31(1)')).toBeInTheDocument();
    expect(within(front).getByText('2026-08-21 14:10:00 - 60.00s')).toBeInTheDocument();
    expect(within(front).getByText('person')).toBeInTheDocument();
    expect(within(screen.getByTestId('timeline-data-2')).getByText('Archived')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'View Event' })[0]).toHaveAttribute(
      'src', expect.stringContaining('/events/31/frames/1/image'),
    );

    expect(screen.getByTestId('timeline-event-31')).toHaveStyle({ backgroundColor: '#ff0000' });
    expect(screen.getByTestId('timeline-event-32')).toHaveStyle({ backgroundColor: '#0000ff' });
    expect(screen.getByTestId('timeline-activity-31')).toBeInTheDocument();
    expect(screen.getAllByTitle('Zoom In')).toHaveLength(12);
    expect(screen.getByTitle('Front')).toHaveStyle({ backgroundColor: '#ff0000' });
    expect(screen.getByTestId('timeline-range')).toHaveTextContent('14:00 - 15:59, 21 Aug 2026');
    expect(screen.getByText('14:10')).toBeInTheDocument();
  });

  it('hover previews, click opens the event, bands and buttons move the window', async () => {
    mockSearch = { min_time: '2026-08-21 14:00:00', max_time: '2026-08-21 15:59:59' };
    await mount();
    const bar = await screen.findByTestId('timeline-event-31');

    fireEvent.mouseOver(screen.getByTestId('timeline-activity-31'));
    await waitFor(() => expect(within(screen.getByTestId('timeline-data-1')).getByText('Event-31')).toBeInTheDocument());

    fireEvent.click(bar);
    expect(mockNavigate).toHaveBeenLastCalledWith({ to: '/events/$eventId', params: { eventId: '31' }, search: {} });

    fireEvent.click(screen.getAllByTestId('timeline-zoom-band')[1]);
    expect(mockNavigate).toHaveBeenLastCalledWith({
      search: { min_time: '2026-08-21 14:10:00', max_time: '2026-08-21 14:20:00' }, replace: true,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Pan Right' }));
    expect(mockNavigate).toHaveBeenLastCalledWith({
      search: { mid_time: '2026-08-21 15:59:59', range: 7200 }, replace: true,
    });
  });

  it('shows the four tips when nothing is in range', async () => {
    server.use(http.post('/api/v3/filters/preview', () => HttpResponse.json(paged([]))));
    mockSearch = { min_time: '2026-08-21 14:00:00', max_time: '2026-08-21 15:59:59' };
    await mount();
    expect(await screen.findByText('Pass your mouse over the graph to view a snapshot image and event details.')).toBeInTheDocument();
    expect(screen.getByText('Click on the coloured sections of the graph, or the image, to view the event.')).toBeInTheDocument();
    expect(screen.getByText('Click on the background to zoom in to a smaller time period based around your click.')).toBeInTheDocument();
    expect(screen.getByText('Use the controls below to zoom out or navigate back and forward through the time range.')).toBeInTheDocument();
  });
});
