/**
 * Tests for the Cycle page (classic skin) — legacy `?view=cycle`: the
 * monitor nav-pills, the single stage, the `<< || |> >>` transport, the
 * Stills/Stream toggle, the Width/Height/Scale trio and the filter row.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useMonitorFilterStore } from '@/stores/monitorFilter';

let mockSearch: Record<string, unknown> = {};
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mockSearch,
  useNavigate: () => vi.fn(),
}));

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// The stage contents are covered by their own tests; here they only need to
// say which monitor they were handed so the rotation can be observed.
vi.mock('@/components/common/StreamCell', () => ({
  StreamCell: ({ monitorId }: { monitorId: number }) =>
    <div data-testid="stream-cell">{`stream:${monitorId}`}</div>,
}));
vi.mock('@/components/monitors/MonitorPreview', () => ({
  MonitorPreview: ({ monitorId }: { monitorId: number }) =>
    <div data-testid="monitor-preview">{`still:${monitorId}`}</div>,
}));

const paged = <T,>(items: T[], over: Record<string, unknown> = {}) => ({
  items, total: items.length, per_page: 100, current_page: 1, last_page: 1, ...over,
});

const MONITORS = [
  { id: 1, name: 'Front Door', capturing: 'Always', analysing: 'Always', recording: 'OnMotion', type: 'Ffmpeg', host: '10.0.0.11', path: null, device: null, width: 1920, height: 1080, orientation: 'ROTATE_0', enabled: 1 },
  { id: 2, name: 'Driveway', capturing: 'Always', analysing: 'None', recording: 'None', type: 'Ffmpeg', host: '10.0.0.12', path: null, device: null, width: 1280, height: 720, orientation: 'ROTATE_0', enabled: 1 },
  // capturing: 'None' — legacy leaves disabled monitors out of the rotation.
  { id: 3, name: 'Garage', capturing: 'None', analysing: 'None', recording: 'None', type: 'Local', host: null, path: null, device: '/dev/video0', width: 640, height: 480, orientation: 'ROTATE_0', enabled: 0 },
];

const server = setupServer();

function stub(monitors: unknown[] = MONITORS) {
  server.use(
    http.get('/api/v3/monitors', () => HttpResponse.json(paged(monitors))),
    http.get('/api/v3/monitor-status', () => HttpResponse.json(paged([
      { monitor_id: 1, status: 'Connected', capture_fps: '10.00', analysis_fps: '5.00', capture_bandwidth: 2048, updated_on: '2026-08-21T00:00:00Z' },
    ], { per_page: 1000 }))),
    http.get('/api/v3/groups', () => HttpResponse.json(paged([{ id: 3, name: 'Front Yard' }], { per_page: 200 }))),
    http.get('/api/v3/groups-monitors', () =>
      HttpResponse.json(paged([{ id: 1, group_id: 3, monitor_id: 1 }], { per_page: 1000 }))),
  );
}

const ALL_EDIT = {
  iat: 0, exp: 0, user: 'admin',
  perms: {
    stream: 'Edit', events: 'Edit', control: 'Edit', monitors: 'Edit',
    groups: 'Edit', devices: 'Edit', snapshots: 'Edit', system: 'Edit',
  },
};

function signIn(perms: unknown = ALL_EDIT) {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', isAuthenticated: true, user: perms as never,
  });
}

beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => { signIn(); });
afterEach(() => {
  server.resetHandlers();
  mockSearch = {};
  useMonitorFilterStore.getState().reset();
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

async function mount() {
  const { default: Page } = await import('./cycle');
  return renderWithProviders(<Page />);
}

/** The nav-pill list, once the monitors have landed. */
async function pills() {
  const nav = await screen.findByRole('navigation', { name: 'Monitors' });
  return within(nav).getAllByRole('button');
}

describe('ClassicCyclePage', () => {
  it('lists only capturing monitors and puts the first one on stage', async () => {
    stub();
    await mount();

    const buttons = await pills();
    expect(buttons.map((b) => b.textContent)).toEqual(['Front Door', 'Driveway']);
    expect(buttons[0]).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('stream-cell')).toHaveTextContent('stream:1');
    expect(screen.getByTestId('cycle-stage')).toHaveAttribute('dir', 'ltr');
  });

  it('walks the rotation with the transport buttons and wraps at both ends', async () => {
    const user = userEvent.setup();
    stub();
    await mount();
    await pills();

    await user.click(screen.getByRole('button', { name: 'Next monitor' }));
    expect(screen.getByTestId('stream-cell')).toHaveTextContent('stream:2');
    await user.click(screen.getByRole('button', { name: 'Next monitor' }));
    expect(screen.getByTestId('stream-cell')).toHaveTextContent('stream:1');
    await user.click(screen.getByRole('button', { name: 'Previous monitor' }));
    expect(screen.getByTestId('stream-cell')).toHaveTextContent('stream:2');
  });

  it('jumps straight to a monitor from its nav-pill', async () => {
    const user = userEvent.setup();
    stub();
    await mount();
    const buttons = await pills();

    await user.click(buttons[1]);
    expect(screen.getByTestId('stream-cell')).toHaveTextContent('stream:2');
    expect((await pills())[1]).toHaveAttribute('aria-current', 'true');
    expect((await pills())[0]).not.toHaveAttribute('aria-current');
  });

  it('starts on ?monitor_id and shows the countdown until paused', async () => {
    const user = userEvent.setup();
    mockSearch = { monitor_id: 2 };
    stub();
    await mount();
    await pills();

    expect(screen.getByTestId('stream-cell')).toHaveTextContent('stream:2');
    // Two monitors in rotation → the auto-advance countdown is visible.
    expect(screen.getByText('10s')).toBeInTheDocument();

    const pause = screen.getByRole('button', { name: 'Pause cycling' });
    const resume = screen.getByRole('button', { name: 'Resume cycling' });
    expect(pause).toBeEnabled();
    expect(resume).toBeDisabled();

    await user.click(pause);
    expect(screen.queryByText('10s')).toBeNull();
    expect(screen.getByRole('button', { name: 'Pause cycling' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Resume cycling' })).toBeEnabled();
  });

  it('auto-advances on the interval timer', async () => {
    vi.useFakeTimers();
    try {
      stub();
      await mount();
      // findBy* needs real timers; poll the DOM manually instead.
      await vi.waitFor(() => expect(screen.getByTestId('stream-cell')).toHaveTextContent('stream:1'));
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(screen.getByTestId('stream-cell')).toHaveTextContent('stream:2');
    } finally {
      vi.useRealTimers();
    }
  });

  it('swaps the stage between the live stream and stills', async () => {
    const user = userEvent.setup();
    stub();
    await mount();
    await pills();

    const toggle = screen.getByRole('button', { name: 'Stills' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);

    expect(screen.queryByTestId('stream-cell')).toBeNull();
    expect(screen.getByTestId('monitor-preview')).toHaveTextContent('still:1');
    expect(screen.getByRole('button', { name: 'Stream' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('resizes the stage from the Width / Height / Scale trio', async () => {
    const user = userEvent.setup();
    stub();
    await mount();
    await pills();

    const group = screen.getByRole('group', { name: 'Stage size' });
    expect(within(group).getByLabelText('Width')).toHaveValue('auto');
    await user.selectOptions(within(group).getByLabelText('Width'), '640px');
    expect(screen.getByTestId('cycle-stage')).toHaveStyle({ width: '640px' });

    await user.selectOptions(within(group).getByLabelText('Height'), '480px');
    expect(screen.getByTestId('cycle-stage')).toHaveStyle({ height: '480px' });

    // The camera's native size joins the option list (legacy appends it).
    expect(within(within(group).getByLabelText('Width') as HTMLSelectElement)
      .getByRole('option', { name: '1920px' })).toBeInTheDocument();
  });

  it('narrows the rotation with the legacy filter row', async () => {
    const user = userEvent.setup();
    stub();
    await mount();
    await pills();

    await user.selectOptions(screen.getByLabelText('Recording'), 'OnMotion');
    await waitFor(async () => expect((await pills()).map((b) => b.textContent)).toEqual(['Front Door']));
    // A single monitor means no auto-advance countdown.
    expect(screen.queryByText(/^\d+s$/)).toBeNull();
  });

  it('shows the legacy empty message when nothing is capturing', async () => {
    stub([MONITORS[2]]);
    await mount();
    expect(await screen.findByText('There are no monitors to view.')).toBeInTheDocument();
    expect(screen.queryByTestId('cycle-stage')).toBeNull();
  });

  it('renders an alert when the monitor list 500s', async () => {
    stub();
    server.use(http.get('/api/v3/monitors', () =>
      HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'boom' }, { status: 500 })));
    await mount();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cannot reach the server.');
  });

  it('renders an alert when the backend is unreachable', async () => {
    stub();
    server.use(http.get('/api/v3/monitors', () => HttpResponse.error()));
    await mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });

  it('replaces the stage with a permission notice without stream:View', async () => {
    signIn({ iat: 0, exp: 0, user: 'viewer', perms: { monitors: 'View', stream: 'None' } });
    stub();
    await mount();
    await pills();

    expect(await screen.findByText('You do not have permission to view this.')).toBeInTheDocument();
    expect(screen.queryByTestId('cycle-stage')).toBeNull();
    // The transport is still rendered — legacy keeps the chrome.
    expect(screen.getByRole('group', { name: 'Cycle controls' })).toBeInTheDocument();
  });

  it('renders nothing at all when signed out', async () => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, isAuthenticated: false, user: null });
    stub();
    const { container } = await mount();
    expect(container).toBeEmptyDOMElement();
  });
});
