import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import type { Monitor } from '@/types';

const page = <T,>(items: T[]) => ({ items, total: items.length, per_page: 500, current_page: 1, last_page: 1 });

const preset = {
  id: 4, model_id: null, name: 'Axis IP, 640x480, mpjpeg', type: 'Remote',
  device: null, channel: null, format: null, protocol: 'http', method: 'simple', host: 'NULL', port: '80',
  path: '/axis-cgi/mjpg/video.cgi?resolution=640x480', sub_path: null,
  width: 640, height: 480, palette: 3, max_fps: 5, controllable: 0, control_id: null,
  control_device: null, control_address: null, default_rate: 100, default_scale: '100',
};
const inspectResult = {
  device_service: 'http://192.168.1.10/onvif/device_service', ptz_service: 'http://192.168.1.10/onvif/ptz', events_service: null,
  manufacturer: 'HIKVISION', model: 'DS-2CD2087G2-LU', firmware_version: 'V5.7.3', serial_number: 'ABC',
  profiles: [
    { token: 'Profile_2', name: 'subStream', encoding: 'H264', width: 640, height: 360, stream_uri: 'rtsp://192.168.1.10:554/Streaming/Channels/102' },
  ],
};

const server = setupServer(
  http.get('/api/v3/controls', () => HttpResponse.json(page([]))),
  http.get('/api/v3/storage', () => HttpResponse.json(page([]))),
  http.get('/api/v3/servers', () => HttpResponse.json(page([]))),
  http.get('/api/v3/manufacturers', () => HttpResponse.json(page([]))),
  http.get('/api/v3/models', () => HttpResponse.json(page([]))),
  http.get('/api/v3/monitors', () => HttpResponse.json(page([]))),
  http.get('/api/v3/groups', () => HttpResponse.json(page([]))),
  http.get('/api/v3/groups-monitors', () => HttpResponse.json(page([]))),
  http.get('/api/v3/monitor_presets', () => HttpResponse.json(page([preset]))),
  http.post('/api/v3/discovery/inspect', () => HttpResponse.json(inspectResult)),
);
beforeAll(() => {
  useAuthStore.setState({ accessToken: 'test', refreshToken: 'test', user: { iat: 0, exp: 0, user: 'admin' }, isAuthenticated: true });
  server.listen({ onUnhandledFrame: 'bypass' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

const { MonitorEditor } = await import('./MonitorEditor');

const monitor = {
  id: 3, name: 'Gate', type: 'Ffmpeg', path: 'rtsp://10.0.0.9/live', method: 'rtpRtsp',
  width: 1920, height: 1080, function: 'Modect', capturing: 'Always', analysing: 'Always', recording: 'OnMotion',
} as unknown as Monitor;

const capturePatch = () => {
  let body: Record<string, unknown> | null = null;
  server.use(http.patch('/api/v3/monitors/3', async ({ request }) => {
    body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...monitor, ...body });
  }));
  return () => body;
};

describe('MonitorEditor — Presets and ONVIF on the Source tab', () => {
  it('a preset fills this monitor’s draft, and Save PATCHes what it changed', async () => {
    const user = userEvent.setup();
    const patched = capturePatch();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^source$/i }));
    await user.click(screen.getByRole('button', { name: /^presets$/i }));

    const dialog = screen.getByRole('dialog', { name: /monitor preset/i });
    const save = within(dialog).getByRole('button', { name: /^save$/i });
    expect(save).toBeDisabled();
    expect(within(dialog).getByText(/may overwrite any values/i)).toBeInTheDocument();
    await within(dialog).findByRole('option', { name: preset.name });
    await user.selectOptions(within(dialog).getByRole('combobox'), String(preset.id));
    await user.click(save);

    expect(screen.queryByRole('dialog', { name: /monitor preset/i })).not.toBeInTheDocument();
    // Nothing is written until Save; the Source tab now shows the Remote fields.
    expect(screen.getByDisplayValue('/axis-cgi/mjpg/video.cgi?resolution=640x480')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^save \d+$/i }));
    await waitFor(() => expect(patched()).toMatchObject({
      type: 'Remote', protocol: 'http', method: 'simple', port: '80', width: 640, height: 480, max_fps: 5,
      path: '/axis-cgi/mjpg/video.cgi?resolution=640x480',
    }));
    expect(patched()).not.toHaveProperty('name');
  });

  it('an ONVIF profile fills this monitor’s source and keeps its name; nothing is created', async () => {
    const user = userEvent.setup();
    let created = false;
    server.use(http.post('/api/v3/monitors', () => { created = true; return HttpResponse.json({}); }));
    const patched = capturePatch();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^source$/i }));
    await user.click(screen.getByRole('button', { name: /onvif probe/i }));

    // A typed device-service URL skips the scan and goes to sign-in.
    fireEvent.change(screen.getByPlaceholderText('http://192.168.1.50/onvif/device_service'), {
      target: { value: 'http://192.168.1.10/onvif/device_service' },
    });
    const wizard = within(screen.getByRole('dialog', { name: /scan network/i }));
    await user.type(wizard.getByLabelText(/^username$/i), 'admin');
    await user.type(wizard.getByLabelText(/^password$/i), 'pw');
    await user.click(wizard.getByRole('button', { name: /^inspect$/i }));
    await screen.findByText('subStream');
    expect(screen.queryByRole('button', { name: /add camera/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /use this profile/i }));

    expect(screen.queryByRole('dialog', { name: /scan network/i })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('rtsp://192.168.1.10:554/Streaming/Channels/102')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^save \d+$/i }));
    await waitFor(() => expect(patched()).toMatchObject({
      path: 'rtsp://192.168.1.10:554/Streaming/Channels/102', width: 640, height: 360,
      onvif_url: 'http://192.168.1.10/onvif/device_service', onvif_username: 'admin', onvif_password: 'pw',
      user: 'admin', pass: 'pw', controllable: 1, control_device: 'Profile_2',
    }));
    expect(patched()).not.toHaveProperty('name');
    expect(created).toBe(false);
  });

  it('hides both buttons from a user without Monitors edit', async () => {
    useAuthStore.setState({ user: { iat: 0, exp: 0, user: 'viewer', perms: { monitors: 'View' } } });
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^source$/i }));
    expect(screen.queryByRole('button', { name: /^presets$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /onvif probe/i })).not.toBeInTheDocument();
    useAuthStore.setState({ user: { iat: 0, exp: 0, user: 'admin' } });
  });
});
