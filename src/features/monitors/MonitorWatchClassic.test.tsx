import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Monitor, ZmEvent, StreamProtocol } from '@/types';
import type { StreamHookResult } from '@/hooks/useWebRtcStream';
import type { PtzState } from '@/features/ptz/usePtz';
import type { WatchAlarmState } from './useWatchPage';

/* -------------------------------------------------------------------------- */
/*  Mocks — router Link is a plain <a>; PtzControls is replaced with a stub.  */
/*  Alarm control arrives as a prop (useWatchPage owns the mutation).         */
/* -------------------------------------------------------------------------- */

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/features/ptz/PtzControls', () => ({
  PtzControls: ({ monitorId }: { monitorId: number }) => (
    <div data-testid="ptz-controls" data-monitor-id={monitorId}>
      PTZ
    </div>
  ),
}));

const { MonitorWatchClassic } = await import('./MonitorWatchClassic');

/* -------------------------------------------------------------------------- */
/*  Test fixtures                                                             */
/* -------------------------------------------------------------------------- */

function makeMonitor(over: Partial<Monitor> = {}): Monitor {
  return {
    id: 1,
    name: 'Front Door',
    width: 1920,
    height: 1080,
    orientation: 'Rotate0',
    capturing: 'Always',
    analysing: 'Always',
    recording: 'OnMotion',
    function: 'Mocord',
    host: '192.168.1.10',
    port: '554',
    path: '/Streaming/Channels/101',
    user: 'admin',
    colours: 4,
    decoding_enabled: 1,
    type: 'Ffmpeg',
    storage_id: 1,
    server_id: null,
    zone_count: 3,
    importance: 'Normal',
    event_prefix: 'Event-',
    max_fps: null,
    ...over,
  } as unknown as Monitor;
}

function makeStream(overrides: Partial<StreamHookResult> = {}): StreamHookResult {
  return {
    videoRef: { current: null },
    state: 'idle',
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
    hasAudio: false,
    ...overrides,
  } as StreamHookResult;
}

function makeEvent(over: Partial<ZmEvent> = {}): ZmEvent {
  return {
    id: 10,
    monitor_id: 1,
    name: 'Event-001',
    cause: 'Motion',
    start_date_time: '2026-06-03T12:00:00Z',
    end_date_time: '2026-06-03T12:00:30Z',
    length: 30,
    frames: 100,
    alarm_frames: 5,
    tot_score: 50,
    avg_score: 10,
    max_score: 90,
    archived: 0,
    width: 1920,
    height: 1080,
    storage_id: 1,
    default_video: 'video.mp4',
    videoed: 1,
    uploaded: 0,
    emailed: 0,
    messaged: 0,
    executed: 0,
    state_id: 1,
    orientation: 'Rotate0',
    scheme: 'Medium',
    locked: 0,
    ...over,
  } as ZmEvent;
}

const NO_PTZ: PtzState = { status: 'no-ptz', message: 'No PTZ' };

function makeAlarm(over: Partial<WatchAlarmState> = {}): WatchAlarmState {
  return {
    available: true, forced: false, isPending: false, error: null,
    force: vi.fn(), cancel: vi.fn(),
    ...over,
  };
}

function renderClassic(props: Partial<Parameters<typeof MonitorWatchClassic>[0]> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const defaults: Parameters<typeof MonitorWatchClassic>[0] = {
    monitor: makeMonitor(),
    stream: makeStream(),
    protocol: 'webrtc' as StreamProtocol,
    onProtocolChange: vi.fn(),
    ptzState: NO_PTZ,
    events: [],
    alarm: makeAlarm(),
    isMuted: true,
    onToggleMute: vi.fn(),
    onToggleFullscreen: vi.fn(),
    onStartStream: vi.fn(),
    onStopStream: vi.fn(),
    onRetry: vi.fn(),
    onEditMonitor: vi.fn(),
    onRefresh: vi.fn(),
  };
  return render(
    <QueryClientProvider client={client}>
      <MonitorWatchClassic {...defaults} {...props} />
    </QueryClientProvider>,
  );
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

describe('MonitorWatchClassic — header + metadata', () => {
  it('renders the monitor name, id badge, and the legacy action buttons', () => {
    renderClassic({ monitor: makeMonitor({ id: 7, name: 'Garage' }) });

    // Title + id badge (the name appears in the breadcrumb AND the metadata
    // table, so getAllByText is the right query here).
    expect(screen.getAllByText('Garage').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/id=7/)).toBeInTheDocument();

    // Legacy cluster
    expect(screen.getByRole('button', { name: /^back$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^refresh$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /force alarm/i })).toBeInTheDocument();
  });

  it('shows dense monitor metadata rows (function, source, resolution, decoding)', () => {
    renderClassic({
      monitor: makeMonitor({
        function: 'Mocord',
        host: '192.168.1.99',
        width: 2560,
        height: 1920,
        decoding_enabled: 1,
      }),
    });
    expect(screen.getByText('Mocord')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.99')).toBeInTheDocument();
    expect(screen.getByText('2560×1920')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });
});

describe('MonitorWatchClassic — events sidebar', () => {
  it('renders "No recent events" when the events list is empty', () => {
    renderClassic({ events: [] });
    expect(screen.getByText(/no recent events/i)).toBeInTheDocument();
  });

  it('renders one row per event with id + name', () => {
    renderClassic({
      events: [
        makeEvent({ id: 100, name: 'EventOne' }),
        makeEvent({ id: 101, name: 'EventTwo' }),
      ],
    });
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('EventOne')).toBeInTheDocument();
    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.getByText('EventTwo')).toBeInTheDocument();
  });
});

describe('MonitorWatchClassic — PTZ panel', () => {
  it('omits the PTZ card when ptzState is not ready', () => {
    renderClassic({ ptzState: NO_PTZ });
    expect(screen.queryByTestId('ptz-controls')).toBeNull();
  });

  it('renders the PTZ controls when capabilities are ready', () => {
    const ready: PtzState = {
      status: 'ready',
      capabilities: {
        protocol: 'Onvif',
        pan_tilt: { can_move: true } as unknown as never,
        zoom: { can: false } as unknown as never,
        focus: { can: false } as unknown as never,
        presets: { has_presets: false } as unknown as never,
      } as never,
    };
    renderClassic({ ptzState: ready });
    expect(screen.getByTestId('ptz-controls')).toBeInTheDocument();
    expect(screen.getByText(/onvif/i)).toBeInTheDocument();
  });
});

describe('MonitorWatchClassic — Force Alarm', () => {
  it('confirms then calls alarm.force() when Force Alarm is clicked', async () => {
    const alarm = makeAlarm();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderClassic({ monitor: makeMonitor({ id: 9 }), alarm });
    await user.click(screen.getByRole('button', { name: /force alarm/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(alarm.force).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it('does NOT force when the user cancels the confirm dialog', async () => {
    const alarm = makeAlarm();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    renderClassic({ alarm });
    await user.click(screen.getByRole('button', { name: /force alarm/i }));

    expect(alarm.force).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('Cancel Alarm calls alarm.cancel() without a confirm', async () => {
    const alarm = makeAlarm({ forced: true });
    const user = userEvent.setup();
    renderClassic({ alarm });
    await user.click(screen.getByRole('button', { name: /cancel alarm/i }));
    expect(alarm.cancel).toHaveBeenCalledTimes(1);
  });

  it('disables the alarm buttons when the monitor is not capturing, and shows the last error', () => {
    renderClassic({ monitor: makeMonitor({ capturing: 'None' }), alarm: makeAlarm({ error: 'shm unavailable' }) });
    expect(screen.getByRole('button', { name: /force alarm/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel alarm/i })).toBeDisabled();
    expect(screen.getByText('shm unavailable')).toBeInTheDocument();
  });
});

describe('MonitorWatchClassic — orientation + runtime', () => {
  it('sizes the stage to the post-rotation aspect and rotates the video for ROTATE_90', () => {
    const { container } = renderClassic({
      monitor: makeMonitor({ width: 3840, height: 2160, orientation: 'ROTATE_90' }),
      stream: makeStream({ state: 'connected' }),
    });
    expect(screen.getByTestId('watch-stage').style.aspectRatio).toBe('2160 / 3840');
    const video = container.querySelector('video')!;
    expect(video.style.transform).toContain('rotate(90deg)');
    expect(video.style.position).toBe('absolute');
  });

  it('keeps the native aspect and no transform for Rotate0', () => {
    const { container } = renderClassic({ stream: makeStream({ state: 'connected' }) });
    expect(screen.getByTestId('watch-stage').style.aspectRatio).toBe('1920 / 1080');
    expect(container.querySelector('video')!.style.transform).toBe('');
  });

  it('shows state + capture/analysis fps from the runtime poll', () => {
    renderClassic({
      runtime: { monitorId: 1, status: 'Connected', captureFps: 10.89, analysisFps: 0, bandwidth: 0, updatedOn: '' },
    });
    expect(screen.getByTestId('watch-runtime')).toHaveTextContent('Connected');
    expect(screen.getByTestId('watch-runtime')).toHaveTextContent('10.9 fps');
  });
});

describe('MonitorWatchClassic — stream controls', () => {
  it('invokes onStartStream when the Start Stream placeholder button is clicked', async () => {
    const onStartStream = vi.fn();
    const user = userEvent.setup();
    renderClassic({
      stream: makeStream({ state: 'idle' }),
      onStartStream,
    });
    await user.click(screen.getByRole('button', { name: /start stream/i }));
    expect(onStartStream).toHaveBeenCalled();
  });

  it('calls onProtocolChange when the protocol select changes', async () => {
    const onProtocolChange = vi.fn();
    const user = userEvent.setup();
    renderClassic({ onProtocolChange });
    await user.selectOptions(screen.getByLabelText(/stream protocol/i), 'hls');
    expect(onProtocolChange).toHaveBeenCalledWith('hls');
  });
});
