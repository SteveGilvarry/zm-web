/**
 * Modern Timeline: the same chart in SVG under a one-line toolbar (pan,
 * zoom out, the window's two edges, Events, Refresh) and a readout table.
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
vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const at = (h: number, m: number, s = 0) => Math.floor(new Date(2026, 7, 21, h, m, s).getTime() / 1000);
const iso = (t: number) => new Date(t * 1000).toISOString();
const paged = <T,>(items: T[]) => ({ items, total: items.length, per_page: 1000, current_page: 1, last_page: 1 });

let events = [
  makeEvent({ id: 41, monitor_id: 1, name: 'Event-41', length: '60.00', start_date_time: iso(at(14, 10)), end_date_time: iso(at(14, 11)), max_score: 50 }),
  makeEvent({ id: 42, monitor_id: 2, name: 'Event-42', length: '30.00', start_date_time: iso(at(15, 0)), end_date_time: iso(at(15, 0, 30)), max_score: 0 }),
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

describe('modern timeline', () => {
  it('draws a row per monitor, the score strip, the axis and the readout', async () => {
    mockSearch = { notes: 'Motion', min_time: '2026-08-21 14:00:00', max_time: '2026-08-21 15:59:59' };
    await mount();
    expect(await screen.findByTestId('timeline-chart')).toBeInTheDocument();

    expect(screen.getByTestId('timeline-event-41')).toHaveAttribute('fill', '#ff0000');
    expect(screen.getByTestId('timeline-event-42')).toHaveAttribute('fill', '#0000ff');
    expect(screen.getByTestId('timeline-activity-41')).toBeInTheDocument();
    expect(screen.getAllByTestId('timeline-zoom-band')).toHaveLength(12);
    expect(screen.getByTestId('timeline-range')).toHaveTextContent('14:00 - 15:59, 21 Aug 2026');
    // jsdom normalises datetime-local values (drops :00, adds .000).
    expect((screen.getByLabelText('Window start') as HTMLInputElement).value).toBe('2026-08-21T14:00');
    expect((screen.getByLabelText('Window end') as HTMLInputElement).value).toMatch(/^2026-08-21T15:59:59/);
    expect(screen.getByRole('link', { name: 'Events' })).toHaveAttribute(
      'href', '/events?notes=Motion&start=2026-08-21T14%3A00%3A00&end=2026-08-21T15%3A59%3A59',
    );

    const readout = screen.getByTestId('timeline-readout');
    expect(within(readout).getByText('Front')).toBeInTheDocument();
    expect(within(readout).getByText('2026-08-21 14:10:00')).toBeInTheDocument();
    expect(within(readout).getByText('60.00s')).toBeInTheDocument();
  });

  it('hover swaps the readout, click opens the event, the controls move the window', async () => {
    mockSearch = { monitor_id: 1, min_time: '2026-08-21 14:00:00', max_time: '2026-08-21 15:59:59' };
    await mount();
    const bar = await screen.findByTestId('timeline-event-41');

    fireEvent.mouseEnter(screen.getByTestId('timeline-activity-41'));
    // No frames came back, so the strip previews the event's alarm frame.
    await waitFor(() => expect(within(screen.getByTestId('timeline-data-1')).getByRole('img')).toHaveAttribute(
      'src', expect.stringContaining('/events/41/frames/alarm/image'),
    ));
    fireEvent.mouseEnter(screen.getByTestId('timeline-event-41'));
    await waitFor(() => expect(within(screen.getByTestId('timeline-data-1')).getByText('#1')).toBeInTheDocument());

    fireEvent.click(bar);
    expect(mockNavigate).toHaveBeenLastCalledWith({ to: '/events/$eventId', params: { eventId: '41' }, search: { monitor_id: 1 } });

    fireEvent.click(screen.getByTestId('timeline-data-2'));
    expect(mockNavigate).toHaveBeenLastCalledWith({ to: '/events/$eventId', params: { eventId: '42' }, search: { monitor_id: 1 } });

    fireEvent.click(screen.getAllByTestId('timeline-zoom-band')[0]);
    expect(mockNavigate).toHaveBeenLastCalledWith({
      search: { monitor_id: 1, min_time: '2026-08-21 14:00:00', max_time: '2026-08-21 14:10:00' }, replace: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Zoom Out' }));
    expect(mockNavigate).toHaveBeenLastCalledWith({
      search: { monitor_id: 1, mid_time: '2026-08-21 15:00:00', range: 43200 }, replace: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pan Left' }));
    expect(mockNavigate).toHaveBeenLastCalledWith({
      search: { monitor_id: 1, mid_time: '2026-08-21 14:00:00', range: 7200 }, replace: true,
    });
    fireEvent.change(screen.getByLabelText('Window start'), { target: { value: '2026-08-21T13:00:00' } });
    expect(mockNavigate).toHaveBeenLastCalledWith({
      search: { monitor_id: 1, min_time: '2026-08-21 13:00:00', max_time: '2026-08-21 15:59:59' }, replace: true,
    });
  });

  it('says so when nothing is in range', async () => {
    events = [];
    mockSearch = { min_time: '2026-08-21 14:00:00', max_time: '2026-08-21 15:59:59' };
    await mount();
    expect(await screen.findByText('No events in this range.')).toBeInTheDocument();
  });
});
