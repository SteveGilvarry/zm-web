/**
 * The monitor.php rows that arrived with zm-api#159/#144/#179/#180: the
 * streaming and encoder columns, Encoder Template + Apply, the Actions tab
 * and the Current Level meter.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { MONITOR_CREATE_DEFAULTS } from '@/api/monitors-crud';
import type { Monitor } from '@/types';

const page = <T,>(items: T[]) => ({ items, total: items.length, per_page: 500, current_page: 1, last_page: 1 });

const TEMPLATES = [
  { id: 2, encoder: 'libx264', name: 'Archival (high quality)', description: 'Slow encode', params: 'preset=slow\ncrf=20\ng=30' },
  { id: 1, encoder: 'libx264', name: 'Balanced', description: null, params: 'preset=fast\ncrf=23' },
  { id: 4, encoder: 'libx265', name: 'Balanced', description: null, params: 'preset=fast\ncrf=25' },
];
const TARGETS = [
  { id: 7, name: 'Hall speaker', device_class: 'Speaker', types: ['AudioPlay', 'AudioStop'], min_audio_file: 1, max_audio_file: 5 },
  { id: 8, name: 'Porch cam', device_class: 'Camera', types: ['LightOn', 'LightOff'], min_audio_file: null, max_audio_file: null },
];
const STORED_ACTION = {
  id: 11, monitor_id: 2, target_monitor_id: 7, action_type: 'AudioPlay', trigger_on: 'Alarm', audio_file: 2,
  label: '', enabled: true, sequence: 0,
};

const calls: string[] = [];
const server = setupServer(
  http.get('/api/v3/controls', () => HttpResponse.json(page([]))),
  http.get('/api/v3/storage', () => HttpResponse.json(page([]))),
  http.get('/api/v3/servers', () => HttpResponse.json(page([]))),
  http.get('/api/v3/manufacturers', () => HttpResponse.json(page([]))),
  http.get('/api/v3/models', () => HttpResponse.json(page([]))),
  http.get('/api/v3/control_presets', () => HttpResponse.json(page([]))),
  http.get('/api/v3/monitors', () => HttpResponse.json(page([{ id: 2, name: 'Driveway East' }]))),
  http.get('/api/v3/groups', () => HttpResponse.json(page([]))),
  http.get('/api/v3/groups-monitors', () => HttpResponse.json(page([]))),
  http.get('/api/v3/users', () => HttpResponse.json(page([]))),
  http.get('/api/v3/encoder-templates', () => HttpResponse.json(TEMPLATES)),
  http.get('/api/v3/monitors/2/actions', () => HttpResponse.json([STORED_ACTION])),
  http.get('/api/v3/monitors/2/actions/targets', () => HttpResponse.json(TARGETS)),
  http.get('/api/v3/monitors/2/audio-level', () => {
    calls.push('audio-level');
    return HttpResponse.json({ level: 42, alarm: false, threshold: 0, detection: false });
  }),
);
beforeAll(() => {
  useAuthStore.setState({ accessToken: 'test', refreshToken: 'test', user: { iat: 0, exp: 0, user: 'admin' }, isAuthenticated: true });
  server.listen({ onUnhandledFrame: 'bypass' });
});
afterEach(() => { server.resetHandlers(); calls.length = 0; });
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to}>{children}</a>,
}));

const { ClassicMonitorEditor } = await import('./ClassicMonitorEditor');

const monitor = {
  id: 2, name: 'Driveway East', type: 'Ffmpeg', device_class: 'Camera', path: 'rtsp://10.0.0.2/main',
  method: 'rtpRtsp', width: 1920, height: 1080, colours: 4, capturing: 'Always', analysing: 'Always',
  recording: 'Always', video_writer: 2, image_buffer_count: 3, pre_event_count: 5, max_image_buffer_count: 0,
  section_length: 600, event_close_mode: 'system', janus_enabled: 0, rtsp2_web_enabled: 0, go2rtc_enabled: 0,
  stream_channel: 'Restream', default_player: '', what_display: 'OnlyVideo', wall_clock_timestamps: 0,
  deleted: false, storage_id: 1, output_codec: 0, encoder: 'auto', audio_threshold: 0,
} as unknown as Monitor;

const capturePatch = () => {
  let body: Record<string, unknown> | null = null;
  server.use(http.patch('/api/v3/monitors/2', async ({ request }) => {
    body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...monitor, ...body });
  }));
  return () => body;
};

const tab = (name: string) => within(screen.getByRole('navigation', { name: 'Monitor tabs' })).getByRole('button', { name });
const optionValues = (name: string) =>
  Array.from((screen.getByRole('combobox', { name }) as HTMLSelectElement).options).map((o) => o.value);

describe('ClassicMonitorEditor — Viewing streaming rows', () => {
  it('Go2RTC reveals Stream source and its players; turning it off drops the player back to Auto', async () => {
    const user = userEvent.setup();
    const patched = capturePatch();
    renderWithProviders(<ClassicMonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(tab('Viewing'));
    expect(screen.getByText(/audioMotion-analyzer\.js/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Stream source' })).toBeNull();
    expect(optionValues('Default Player')).toEqual(['', 'zms']);

    await user.click(screen.getByRole('checkbox', { name: 'Go2RTC Live Stream' }));
    expect(optionValues('Stream source')).toEqual(['Restream', 'CameraDirectPrimary', 'CameraDirectSecondary']);
    expect(optionValues('Default Player')).toEqual(['', 'zms', 'go2rtc', 'go2rtc_webrtc', 'go2rtc_mse', 'go2rtc_hls']);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Default Player' }), 'go2rtc_mse');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Stream source' }), 'CameraDirectSecondary');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Show' }), 'VideoAudioVisualization');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patched()).toEqual({
      go2rtc_enabled: 1, default_player: 'go2rtc_mse', stream_channel: 'CameraDirectSecondary', what_display: 'VideoAudioVisualization',
    }));

    await user.click(screen.getByRole('checkbox', { name: 'Go2RTC Live Stream' }));
    expect((screen.getByRole('combobox', { name: 'Default Player' }) as HTMLSelectElement).value).toBe('');
  });

  it('RTSP2Web and Janus gate their own players', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClassicMonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(tab('Viewing'));
    await user.click(screen.getByRole('checkbox', { name: 'RTSP2Web Live Stream' }));
    await user.click(screen.getByRole('checkbox', { name: 'Janus Live Stream' }));
    expect(optionValues('Default Player')).toEqual(['', 'zms', 'rtsp2web_webrtc', 'rtsp2web_mse', 'rtsp2web_hls', 'janus']);
    expect(screen.getByRole('combobox', { name: 'Stream source' })).toBeInTheDocument();
  });
});

describe('ClassicMonitorEditor — Recording encoder rows', () => {
  it('Wallclock Timestamps shows except while encoding; HW accel rows always', async () => {
    const user = userEvent.setup();
    const patched = capturePatch();
    renderWithProviders(<ClassicMonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(tab('Recording'));
    await user.click(screen.getByRole('checkbox', { name: 'Use Wallclock Timestamps' }));
    await user.type(screen.getByRole('textbox', { name: 'Encoder HW Accel Name' }), 'vaapi');
    await user.type(screen.getByRole('textbox', { name: 'Encoder HW Accel Device' }), '/dev/dri/renderD128');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patched()).toEqual({
      wall_clock_timestamps: 1, encoder_hw_accel_name: 'vaapi', encoder_hw_accel_device: '/dev/dri/renderD128',
    }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Video Writer' }), '1');
    expect(screen.queryByRole('checkbox', { name: 'Use Wallclock Timestamps' })).toBeNull();
  });

  it('Encoder Template lists the encoder’s templates and Apply merges one into the parameters', async () => {
    const user = userEvent.setup();
    const patched = capturePatch();
    const encoding = { ...monitor, video_writer: 1, encoder: 'libx264', encoder_parameters: 'crf=30\nmine=1' } as unknown as Monitor;
    renderWithProviders(<ClassicMonitorEditor monitor={encoding} onClose={() => {}} />);
    await user.click(tab('Recording'));
    const picker = await screen.findByRole('combobox', { name: 'Encoder Template' });
    expect(Array.from((picker as HTMLSelectElement).options).map((o) => o.text)).toEqual(['Archival (high quality)', 'Balanced']);
    await user.click(screen.getByRole('button', { name: 'Apply template' }));
    const params = screen.getByRole('textbox', { name: 'Optional Encoder Parameters' }) as HTMLTextAreaElement;
    expect(params.value).toBe('crf=20\nmine=1\npreset=slow\ng=30');
    // `mine` is not an x264 option: legacy's lint says so under the box.
    expect(screen.getByText(/`mine` are not recognised options for `libx264`/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patched()).toEqual({ encoder_parameters: 'crf=20\nmine=1\npreset=slow\ng=30' }));
  });

  it('switching encoder offers the template of the same name, and the row goes when the encoder has none', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const encoding = { ...monitor, video_writer: 1, encoder: 'libx264', encoder_parameters: '' } as unknown as Monitor;
    renderWithProviders(<ClassicMonitorEditor monitor={encoding} onClose={() => {}} />);
    await user.click(tab('Recording'));
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Encoder Template' }), '1');
    await user.click(screen.getByRole('button', { name: 'Apply template' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Encoder' }), 'libx265');
    expect(confirm).toHaveBeenCalledWith('You had "Balanced" applied. Apply Balanced for libx265?');
    expect((screen.getByRole('textbox', { name: 'Optional Encoder Parameters' }) as HTMLTextAreaElement).value).toBe('preset=fast\ncrf=25');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Encoder' }), 'h264_qsv');
    expect(screen.queryByRole('combobox', { name: 'Encoder Template' })).toBeNull();
    confirm.mockRestore();
  });
});

describe('ClassicMonitorEditor — Current Level', () => {
  it('shows the live level with the threshold mark, polling about every two seconds', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClassicMonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(tab('Analysis'));
    const meter = screen.getByRole('meter', { name: 'Current Level' });
    await waitFor(() => expect(meter).toHaveAttribute('aria-valuenow', '42'));
    expect(screen.queryByTestId('audio-threshold-mark')).toBeNull();
    await user.type(screen.getByRole('spinbutton', { name: 'Audio Threshold' }), '30');
    expect(screen.getByTestId('audio-threshold-mark')).toHaveStyle({ left: '30%' });
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(2), { timeout: 3500 });
  });

  it('says so when zmc is not running instead of showing zero, and stops polling off the tab', async () => {
    server.use(http.get('/api/v3/monitors/2/audio-level', () => {
      calls.push('audio-level');
      return HttpResponse.json({ level: null, alarm: null, threshold: 0, detection: false });
    }));
    const user = userEvent.setup();
    renderWithProviders(<ClassicMonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(tab('Analysis'));
    expect(await screen.findByText('no reading')).toBeInTheDocument();
    await user.click(tab('Misc'));
    const seen = calls.length;
    await new Promise((r) => setTimeout(r, 2300));
    expect(calls.length).toBe(seen);
  });
});

describe('ClassicMonitorEditor — Actions tab', () => {
  it('lists the stored action and a spare row; Save sends one call per changed row', async () => {
    const user = userEvent.setup();
    const sent: Array<[string, string, unknown]> = [];
    server.use(
      http.patch('/api/v3/monitors/2/actions/11', async ({ request }) => {
        sent.push(['PATCH', '11', await request.json()]);
        return HttpResponse.json(STORED_ACTION);
      }),
      http.post('/api/v3/monitors/2/actions', async ({ request }) => {
        sent.push(['POST', '', await request.json()]);
        return HttpResponse.json({ ...STORED_ACTION, id: 12 });
      }),
    );
    renderWithProviders(<ClassicMonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(tab('Actions'));
    const table = await screen.findByTestId('monitor-actions');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Enabled', 'When', 'Device', 'Does', 'Sound']);
    expect(screen.getByText('To remove an action, set its device to None and save.')).toBeInTheDocument();

    // Row 1 is stored; row 2 is the spare, whose type list is greyed out until it has a device.
    expect(screen.getByRole('combobox', { name: 'Action 2: Does' })).toBeDisabled();
    const sound = screen.getByRole('spinbutton', { name: 'Action 1: Sound' });
    await user.clear(sound);
    await user.type(sound, '3');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Action 2: Device' }), '8');
    // Only what the porch camera can do.
    const does = screen.getByRole('combobox', { name: 'Action 2: Does' }) as HTMLSelectElement;
    expect(Array.from(does.options).map((o) => o.text)).toEqual(['Turn light on', 'Turn light off']);
    // A new spare appears under it.
    expect(screen.getByRole('combobox', { name: 'Action 3: Device' })).toBeInTheDocument();
    expect(tab('Actions')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent).toEqual([
      ['PATCH', '11', { audio_file: 3 }],
      ['POST', '', { target_monitor_id: 8, action_type: 'LightOn', trigger_on: 'EventStart', audio_file: null, label: '', enabled: true, sequence: 1 }],
    ]);
  });

  it('setting a stored action’s device to None deletes it on Save', async () => {
    const user = userEvent.setup();
    let deleted = false;
    server.use(http.delete('/api/v3/monitors/2/actions/11', () => { deleted = true; return new HttpResponse(null, { status: 204 }); }));
    renderWithProviders(<ClassicMonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(tab('Actions'));
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Action 1: Device' }), '');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(deleted).toBe(true));
  });

  it('with no capable device and no actions, only the legacy warning', async () => {
    server.use(
      http.get('/api/v3/monitors/2/actions', () => HttpResponse.json([])),
      http.get('/api/v3/monitors/2/actions/targets', () => HttpResponse.json([])),
    );
    const user = userEvent.setup();
    renderWithProviders(<ClassicMonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(tab('Actions'));
    expect(await screen.findByText(/No monitor has a control that supports a light or audio playback/)).toBeInTheDocument();
    expect(screen.queryByTestId('monitor-actions')).toBeNull();
  });

  it('a new monitor has no Actions tab and no level meter', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClassicMonitorEditor seed={{ values: { ...MONITOR_CREATE_DEFAULTS } }} onClose={() => {}} />);
    expect(within(screen.getByRole('navigation', { name: 'Monitor tabs' })).queryByRole('button', { name: 'Actions' })).toBeNull();
    await user.click(tab('Analysis'));
    expect(screen.queryByRole('meter')).toBeNull();
  });
});
