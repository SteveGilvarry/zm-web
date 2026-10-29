import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { chosenChips } from '@/test/chosen';
import { useAuthStore } from '@/stores/auth';
import type { Monitor } from '@/types';

const page = <T,>(items: T[]) => ({ items, total: items.length, per_page: 500, current_page: 1, last_page: 1 });

const server = setupServer(
  http.get('/api/v3/controls', () => HttpResponse.json(page([]))),
  http.get('/api/v3/storage', () => HttpResponse.json(page([{ id: 1, name: 'Default', path: '/var/cache/zoneminder/events', type: 'local', enabled: 1 }]))),
  http.get('/api/v3/servers', () => HttpResponse.json(page([]))),
  http.get('/api/v3/manufacturers', () => HttpResponse.json(page([]))),
  http.get('/api/v3/models', () => HttpResponse.json(page([]))),
  http.get('/api/v3/control_presets', () => HttpResponse.json(page([]))),
  http.get('/api/v3/monitors', () => HttpResponse.json(page([{ id: 2, name: 'Driveway East' }]))),
  http.get('/api/v3/groups', () => HttpResponse.json(page([{ id: 1, name: 'Front Yard', parent_id: null }]))),
  http.get('/api/v3/groups-monitors', () => HttpResponse.json(page([]))),
  http.get('/api/v3/users', () => HttpResponse.json(page([{ id: 1, username: 'admin' }]))),
  http.get('/api/v3/monitor_presets', () => HttpResponse.json(page([{
    id: 4, model_id: null, name: 'Axis IP, mpjpeg', type: 'Remote', device: null, channel: null, format: null,
    protocol: 'http', method: 'simple', host: 'NULL', port: '80', path: '/axis-cgi/mjpg/video.cgi', sub_path: null,
    width: 640, height: 480, palette: null, max_fps: null, controllable: 0, control_id: null, control_device: null,
    control_address: null, default_rate: 100, default_scale: '100',
  }]))),
);
beforeAll(() => {
  useAuthStore.setState({ accessToken: 'test', refreshToken: 'test', user: { iat: 0, exp: 0, user: 'admin' }, isAuthenticated: true });
  server.listen({ onUnhandledFrame: 'bypass' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to}>{children}</a>,
}));

const { ClassicMonitorEditor } = await import('./ClassicMonitorEditor');

const monitor = {
  id: 2, name: 'Driveway East', type: 'Ffmpeg', device_class: 'Camera', path: 'rtsp://10.0.0.2/main',
  method: 'rtpRtsp', width: 1920, height: 1080, colours: 4, capturing: 'Always', analysing: 'Always',
  recording: 'Always', video_writer: 2, image_buffer_count: 3, pre_event_count: 5, max_image_buffer_count: 0,
  section_length: 600, section_length_warn: 0, event_close_mode: 'system', janus_enabled: 0, deleted: false,
  storage_id: 1, output_codec: 0, encoder: 'auto',
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

describe('ClassicMonitorEditor', () => {
  it('renders the legacy page: title, header buttons, rows and footer', async () => {
    renderWithProviders(<ClassicMonitorEditor monitor={monitor} onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Monitor - 2 - Driveway East' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    // The ONVIF tab, and the header's ONVIF probe button (legacy titles it ONVIF too).
    expect(screen.getAllByRole('button', { name: 'ONVIF' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Presets' })).toBeInTheDocument();
    expect(screen.getByText('Source Type')).toBeInTheDocument();
    expect(screen.getByText('None available')).toBeInTheDocument();
    // monitor.php's chosen Groups box: no data-placeholder, no clear-all.
    expect(screen.getByRole('combobox', { name: 'Groups' })).toHaveAttribute('placeholder', 'Select Some Options');
    expect(screen.queryByRole('button', { name: 'Clear groups' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save and close' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('picks groups in the chosen Groups box', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClassicMonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('combobox', { name: 'Groups' }));
    await user.click(await within(screen.getByRole('listbox', { name: 'Groups' })).findByRole('option', { name: 'Front Yard' }));
    expect(chosenChips('Groups')).toEqual(['Front Yard']);
    await user.click(screen.getByRole('button', { name: 'Remove Front Yard' }));
    expect(chosenChips('Groups')).toEqual([]);
  });

  it('opens on the ?tab= tab and reports tab changes', async () => {
    const onTabChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ClassicMonitorEditor monitor={monitor} onClose={() => {}} initialTab="buffers" onTabChange={onTabChange} />);
    expect(tab('Buffers')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('estimated-ram')).toHaveTextContent('Min: 63.28MB Max: Unlimited');
    await user.click(tab('Misc'));
    expect(onTabChange).toHaveBeenCalledWith('misc');
  });

  it('Misc: section length in seconds with Warn if exceeded beside it; Event Close Mode as radios', async () => {
    const user = userEvent.setup();
    const patched = capturePatch();
    renderWithProviders(<ClassicMonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(tab('Misc'));
    const row = screen.getByText('Section length').closest('li')!;
    expect(within(row).getByText('seconds')).toBeInTheDocument();
    await user.click(within(row).getByRole('checkbox', { name: 'Warn if exceeded' }));
    const close = screen.getByRole('radiogroup', { name: 'Event Close Mode' });
    expect(within(close).getAllByRole('radio').map((r) => r.parentElement!.textContent)).toEqual(['System', 'Time', 'Duration', 'Idle', 'Alarm']);
    await user.click(within(close).getByRole('radio', { name: 'Idle' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patched()).toEqual({ section_length_warn: 1, event_close_mode: 'idle' }));
  });

  it('Max FPS shows the legacy caution once it has a value', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClassicMonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(tab('Source'));
    expect(screen.queryByText('CAUTION: See the help text')).not.toBeInTheDocument();
    await user.type(screen.getByRole('spinbutton', { name: 'Maximum FPS' }), '5');
    expect(screen.getByText('CAUTION: See the help text')).toBeInTheDocument();
    // (?) reveals the option help.
    await user.click(screen.getByRole('button', { name: 'Help for Maximum FPS' }));
    expect(screen.getByText(/set the frame rate in the camera instead/)).toBeInTheDocument();
  });

  it('Encode reveals Output Codec and Encoder, and the encoder list follows the codec', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClassicMonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(tab('Recording'));
    expect(screen.queryByRole('combobox', { name: 'Encoder' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Video Writer' }), '1');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Output Codec' }), '27');
    const encoder = screen.getByRole('combobox', { name: 'Encoder' }) as HTMLSelectElement;
    const option = (v: string) => Array.from(encoder.options).find((o) => o.value === v)!;
    expect(option('libx264').disabled).toBe(false);
    expect(option('hevc_vaapi').disabled).toBe(true);
    expect(option('auto').disabled).toBe(false);
  });

  it('Zones with unsaved edits asks first: Do not save leaves, Save saves then leaves', async () => {
    const user = userEvent.setup();
    const patched = capturePatch();
    navigate.mockClear();
    renderWithProviders(<ClassicMonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(tab('Zones'));
    // Nothing changed: straight to the zones page.
    expect(navigate).toHaveBeenCalledWith({ to: '/monitors/$monitorId/zones', params: { monitorId: '2' } });
    navigate.mockClear();

    await user.type(screen.getByRole('textbox', { name: 'Notes' }), 'porch');
    await user.click(tab('Zones'));
    const confirm = screen.getByRole('dialog', { name: 'Action Confirmation' });
    expect(within(confirm).getByText(/You are leaving the page/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patched()).toEqual({ notes: 'porch' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/monitors/$monitorId/zones', params: { monitorId: '2' } }));
  });

  it('a deleted monitor offers Undelete, which PATCHes deleted: false', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> | null = null;
    server.use(http.patch('/api/v3/monitors/2', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ...monitor, deleted: false });
    }));
    renderWithProviders(<ClassicMonitorEditor monitor={{ ...monitor, deleted: true } as Monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('checkbox', { name: 'Monitor is Deleted, Undelete?' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(body).toEqual({ deleted: false }));
  });

  it('Presets in the header fills the Source of this monitor', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClassicMonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Presets' }));
    const dialog = screen.getByRole('dialog', { name: 'Monitor Preset' });
    await within(dialog).findByRole('option', { name: 'Axis IP, mpjpeg' });
    await user.selectOptions(within(dialog).getByRole('combobox'), '4');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await user.click(tab('Source'));
    expect(screen.getByDisplayValue('/axis-cgi/mjpg/video.cgi')).toBeInTheDocument();
    expect(screen.getByText('Host Name')).toBeInTheDocument();
  });

  it('Back goes back; Cancel leaves for wherever the page sends it (the console)', async () => {
    const onBack = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ClassicMonitorEditor monitor={monitor} onClose={onClose} onBack={onBack} />);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the Options textarea grows with its entries, as monitor.php sizes it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClassicMonitorEditor monitor={{ ...monitor, options: 'a=1,b=2,c=3' } as Monitor} onClose={() => {}} />);
    await user.click(tab('Source'));
    expect(screen.getByRole('textbox', { name: 'Options' })).toHaveAttribute('rows', '3');
  });

  it('a Web Site monitor gets General and Source only', () => {
    renderWithProviders(<ClassicMonitorEditor monitor={{ ...monitor, type: 'WebSite' } as Monitor} onClose={() => {}} />);
    const rail = within(screen.getByRole('navigation', { name: 'Monitor tabs' }));
    expect(rail.getAllByRole('button').map((b) => b.textContent)).toEqual(['General', 'Source']);
  });

  it('hides the Control tab from a user without Control view', () => {
    useAuthStore.setState({ user: { iat: 0, exp: 0, user: 'op', perms: { monitors: 'Edit', control: 'None' } } });
    renderWithProviders(<ClassicMonitorEditor monitor={monitor} onClose={() => {}} />);
    const rail = within(screen.getByRole('navigation', { name: 'Monitor tabs' }));
    expect(rail.queryByRole('button', { name: 'Control' })).not.toBeInTheDocument();
    useAuthStore.setState({ user: { iat: 0, exp: 0, user: 'admin' } });
  });

  it('shows Please Wait while saving and hides the buttons', async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    server.use(http.patch('/api/v3/monitors/2', () => new Promise((resolve) => {
      release = () => resolve(HttpResponse.json(monitor));
    })));
    renderWithProviders(<ClassicMonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.type(screen.getByRole('textbox', { name: 'Notes' }), 'x');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Monitor data is saved')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save and close' })).not.toBeInTheDocument();
    release();
    expect(await screen.findByRole('button', { name: 'Save and close' })).toBeInTheDocument();
  });

  it('a new monitor: titled by its name, Zones disabled, Save disabled, Save and close creates it', async () => {
    const { newMonitorSeed } = await import('@/features/monitors/editor/newMonitor');
    let body: Record<string, unknown> | null = null;
    server.use(http.post('/api/v3/monitors', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ...body, id: 3 });
    }));
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ClassicMonitorEditor seed={newMonitorSeed([{ id: 2, name: 'Driveway East' } as Monitor])} onClose={onClose} />);
    expect(screen.getByRole('heading', { name: 'Monitor - Monitor-3' })).toBeInTheDocument();
    expect(tab('Zones')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    // Legacy validateForm: an Ffmpeg monitor needs a Source Path.
    await user.click(screen.getByRole('button', { name: 'Save and close' }));
    expect(await screen.findByText('Source -> Path must be set to a valid value')).toBeInTheDocument();
    expect(tab('Source')).toHaveAttribute('aria-current', 'page');
    await user.type(screen.getByRole('textbox', { name: 'Source Path' }), 'rtsp://10.0.0.3/live');
    await user.click(screen.getByRole('button', { name: 'Save and close' }));
    await waitFor(() => expect(body).toMatchObject({ name: 'Monitor-3', path: 'rtsp://10.0.0.3/live', pre_event_count: 5, max_image_buffer_count: 121 }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
