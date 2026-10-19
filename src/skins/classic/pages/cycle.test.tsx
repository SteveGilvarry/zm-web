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
import { pickChosen } from '@/test/chosen';
import { useAuthStore } from '@/stores/auth';
import { useMonitorFilterStore } from '@/stores/monitorFilter';
import { useMonitorFilterRowStore } from '@/stores/monitorFilterRow';
import { useMontageStore } from '@/stores/montage';
import { DEFAULT_STAGE_SIZE } from '@/features/monitors/watchStage';

let mockSearch: Record<string, unknown> = {};
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mockSearch,
  useNavigate: () => vi.fn(),
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; [k: string]: unknown }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
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
    http.get('/api/v3/configs', () => HttpResponse.json(paged([
      { id: 1, name: 'ZM_WEB_REFRESH_CYCLE', value: '10' },
    ], { per_page: 1000 }))),
    http.get('/api/v3/servers', () => HttpResponse.json(paged([]))),
    http.get('/api/v3/storage', () => HttpResponse.json(paged([]))),
    http.get('/api/v3/me', () => new HttpResponse(null, { status: 404 })),
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
  useMonitorFilterRowStore.getState().reset();
  useMontageStore.setState({ cycleStage: { ...DEFAULT_STAGE_SIZE } });
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

  it('holds each monitor for the dwell time ZoneMinder is configured for, with no countdown', async () => {
    vi.useFakeTimers();
    try {
      stub();
      server.use(http.get('/api/v3/configs', () => HttpResponse.json(paged([
        { id: 1, name: 'ZM_WEB_REFRESH_CYCLE', value: '45' },
      ], { per_page: 1000 }))));
      await mount();
      await vi.waitFor(() => expect(screen.getByTestId('stream-cell')).toHaveTextContent('stream:1'));
      // Let the config land before the clock starts counting.
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      // Legacy prints no countdown next to the transport.
      expect(screen.queryByText(/^\d+s$/)).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(44_000); });
      expect(screen.getByTestId('stream-cell')).toHaveTextContent('stream:1');
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      expect(screen.getByTestId('stream-cell')).toHaveTextContent('stream:2');
    } finally {
      vi.useRealTimers();
    }
  });

  it('puts the zoom / fullscreen / watch controls over the stage', async () => {
    const user = userEvent.setup();
    stub();
    await mount();
    await pills();

    const controls = within(screen.getByTestId('cycle-stage')).getByTestId('tile-controls-1');
    const framed = screen.getByTestId('stream-cell').parentElement!;
    expect(framed).not.toHaveStyle({ transform: 'scale(1.3)' });
    await user.click(within(controls).getByRole('button', { name: 'Zoom IN' }));
    expect(screen.getByTestId('stream-cell').parentElement).toHaveStyle({ transform: 'scale(1.3)' });
    expect(within(controls).getByRole('link', { name: 'Open watch page' })).toBeInTheDocument();
  });

  it('walks the rotation with the transport buttons and wraps at both ends', async () => {
    const user = userEvent.setup();
    stub();
    await mount();
    await pills();

    await user.click(screen.getByRole('button', { name: 'Next Monitor' }));
    expect(screen.getByTestId('stream-cell')).toHaveTextContent('stream:2');
    await user.click(screen.getByRole('button', { name: 'Next Monitor' }));
    expect(screen.getByTestId('stream-cell')).toHaveTextContent('stream:1');
    await user.click(screen.getByRole('button', { name: 'Previous Monitor' }));
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

  it('starts on ?monitor_id; pause disables || and enables |>', async () => {
    const user = userEvent.setup();
    mockSearch = { monitor_id: 2 };
    stub();
    await mount();
    await pills();

    expect(screen.getByTestId('stream-cell')).toHaveTextContent('stream:2');
    const pause = screen.getByRole('button', { name: 'Pause Cycle' });
    const play = screen.getByRole('button', { name: 'Play Cycle' });
    expect(pause).toBeEnabled();
    expect(pause).toHaveTextContent('||');
    expect(play).toBeDisabled();
    expect(play).toHaveTextContent('|>');

    await user.click(pause);
    expect(screen.getByRole('button', { name: 'Pause Cycle' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Play Cycle' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Play Cycle' }));
    expect(screen.getByRole('button', { name: 'Pause Cycle' })).toBeEnabled();
  });

  it('a step or a nav-pill resumes a paused cycle, as legacy\'s page load does', async () => {
    const user = userEvent.setup();
    stub();
    await mount();
    await pills();

    await user.click(screen.getByRole('button', { name: 'Pause Cycle' }));
    await user.click(screen.getByRole('button', { name: 'Next Monitor' }));
    expect(screen.getByTestId('stream-cell')).toHaveTextContent('stream:2');
    expect(screen.getByRole('button', { name: 'Pause Cycle' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Pause Cycle' }));
    await user.click((await pills())[0]);
    expect(screen.getByRole('button', { name: 'Pause Cycle' })).toBeEnabled();
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

  it('Scale puts Width and Height back to auto, and Width puts Scale back to Auto', async () => {
    const user = userEvent.setup();
    stub();
    await mount();
    await pills();

    const group = screen.getByRole('group', { name: 'Stage size' });
    await user.selectOptions(within(group).getByLabelText('Width'), '640px');
    await user.selectOptions(within(group).getByLabelText('Height'), '480px');
    // legacy changeScale
    await user.selectOptions(within(group).getByLabelText('Scale'), '100');
    expect(within(group).getByLabelText('Width')).toHaveValue('auto');
    expect(within(group).getByLabelText('Height')).toHaveValue('auto');
    expect(screen.getByTestId('cycle-stage')).toHaveStyle({ width: '1920px' });
    // legacy changeSize
    await user.selectOptions(within(group).getByLabelText('Width'), '320px');
    expect(within(group).getByLabelText('Scale')).toHaveValue('0');
    expect(screen.getByTestId('cycle-stage')).toHaveStyle({ width: '320px' });
  });

  it('on all-auto fits the stage to the window height, like legacy scaleToFit', async () => {
    stub();
    await mount();
    await pills();
    // jsdom: the stage area's top is 0 and the window 768 px tall, less the
    // 64 px transport row → 704 px, so a 16:9 camera is at most 1251 px wide.
    await waitFor(() => expect(screen.getByTestId('cycle-stage')).toHaveStyle({ width: '1251px', maxWidth: '100%' }));
  });

  it('narrows the rotation with the legacy filter row', async () => {
    const user = userEvent.setup();
    stub();
    await mount();
    await pills();

    await pickChosen(user, 'Recording', 'On Motion');
    await waitFor(async () => expect((await pills()).map((b) => b.textContent)).toEqual(['Front Door']));
  });

  it('a filter change starts the rotation again from its first monitor', async () => {
    const user = userEvent.setup();
    stub();
    await mount();
    await pills();

    await user.click(screen.getByRole('button', { name: 'Next Monitor' }));
    expect(screen.getByTestId('stream-cell')).toHaveTextContent('stream:2');
    await user.click(screen.getByRole('button', { name: 'Pause Cycle' }));
    // Driveway (2) records nothing; Front Door survives and goes on stage,
    // and the reload legacy does here leaves the cycle playing.
    await pickChosen(user, 'Recording', 'On Motion');
    await waitFor(() => expect(screen.getByTestId('stream-cell')).toHaveTextContent('stream:1'));
    expect(screen.getByRole('button', { name: 'Pause Cycle' })).toBeEnabled();
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

  it('embeds a WebSite monitor on stage instead of streaming it', async () => {
    // Legacy `Monitor::getStreamHTML` embeds the configured URL for the
    // WebSite type.
    stub([{
      id: 4, name: 'Weather', capturing: 'Always', analysing: 'None', recording: 'None',
      type: 'WebSite', host: null, path: 'https://example.test/wx', device: null,
      width: 1920, height: 1080, orientation: 'ROTATE_0', enabled: 1,
    }]);
    await mount();
    await pills();

    expect(await screen.findByTestId('website-tile-4')).toHaveAttribute('src', 'https://example.test/wx');
    expect(screen.queryByTestId('stream-cell')).toBeNull();
  });
});
