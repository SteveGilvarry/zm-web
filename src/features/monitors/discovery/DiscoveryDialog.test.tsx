import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import DiscoveryDialog from './DiscoveryDialog';

const candidates = [
  { endpoint_reference: 'urn:uuid:1', xaddrs: ['http://192.168.1.10/onvif/device_service'], types: ['NetworkVideoTransmitter'], name: 'Front cam', hardware: 'DS-2CD2087', location: 'porch' },
  { endpoint_reference: 'urn:uuid:2', xaddrs: ['http://192.168.1.11/onvif/device_service'], types: ['NetworkVideoTransmitter'], name: null, hardware: null, location: null },
];
const inspectResult = {
  device_service: 'http://192.168.1.10/onvif/device_service', ptz_service: null, events_service: 'http://192.168.1.10/onvif/event_service',
  manufacturer: 'HIKVISION', model: 'DS-2CD2087G2-LU', firmware_version: 'V5.7.3', serial_number: 'ABC',
  profiles: [
    { token: 'Profile_1', name: 'mainStream', encoding: 'H264', width: 3840, height: 2160, stream_uri: 'rtsp://192.168.1.10:554/Streaming/Channels/101' },
  ],
};

const page = <T,>(items: T[]) => ({ items, total: items.length, per_page: 500, current_page: 1, last_page: 1 });
const server = setupServer(
  http.get('/api/v3/monitor_presets', () => HttpResponse.json(page([]))),
  http.get('/api/v3/storage', () => HttpResponse.json(page([{ id: 1, name: 'Default', path: '/x', type: 'local', enabled: 1 }]))),
);
beforeAll(() => {
  useAuthStore.setState({ accessToken: 'test', refreshToken: 'test', user: { iat: 0, exp: 0, user: 'admin' }, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'bypass' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

describe('DiscoveryDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = renderWithProviders(<DiscoveryDialog open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('scan → candidates → inspect → profiles → prefilled Add dialog → POST /monitors', async () => {
    const user = userEvent.setup();
    let probeBody: unknown = null;
    let inspectBody: unknown = null;
    let created: Record<string, unknown> | null = null;
    const onCreated = vi.fn();
    const onClose = vi.fn();
    server.use(
      http.post('/api/v3/discovery/probe', async ({ request }) => { probeBody = await request.json(); return HttpResponse.json(candidates); }),
      http.post('/api/v3/discovery/inspect', async ({ request }) => { inspectBody = await request.json(); return HttpResponse.json(inspectResult); }),
      http.post('/api/v3/monitors', async ({ request }) => { created = await request.json() as Record<string, unknown>; return HttpResponse.json({ id: 9, ...created }); }),
    );

    renderWithProviders(<DiscoveryDialog open onClose={onClose} onCreated={onCreated} />);
    await user.click(screen.getByRole('button', { name: /^scan$/i }));
    await waitFor(() => expect(probeBody).toEqual({ timeout_ms: 5000 }));

    // Candidate table: name / hardware / location / address.
    await screen.findByText('Front cam');
    expect(screen.getByText('DS-2CD2087')).toBeInTheDocument();
    expect(screen.getByText('http://192.168.1.11/onvif/device_service')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /^inspect$/i })[0]);
    expect(screen.getByDisplayValue('http://192.168.1.10/onvif/device_service')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^username$/i), 'admin');
    await user.type(screen.getByLabelText(/^password$/i), 'pw');
    await user.click(screen.getByRole('button', { name: /^inspect$/i }));
    await waitFor(() => expect(inspectBody).toEqual({ xaddr: 'http://192.168.1.10/onvif/device_service', username: 'admin', password: 'pw' }));

    // Profile table with the resolved stream.
    await screen.findByText('mainStream');
    expect(screen.getByText('3840×2160')).toBeInTheDocument();
    expect(screen.getByText('HIKVISION')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /create monitor/i }));
    // The Add dialog opens prefilled from the profile.
    const dialog = await screen.findByRole('dialog', { name: /add monitor/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByDisplayValue('Front cam')).toBeInTheDocument();
    expect(screen.getByDisplayValue('rtsp://192.168.1.10:554/Streaming/Channels/101')).toBeInTheDocument();
    expect(screen.getByLabelText('Width (px)')).toHaveValue(3840);

    await user.click(screen.getByRole('button', { name: /create monitor/i }));
    await waitFor(() => expect(created).not.toBeNull());
    expect(created!).toMatchObject({
      name: 'Front cam', type: 'Ffmpeg', path: 'rtsp://192.168.1.10:554/Streaming/Channels/101', user: 'admin', pass: 'pw',
      onvif_url: 'http://192.168.1.10/onvif/device_service', onvif_username: 'admin', onvif_password: 'pw', width: 3840, height: 2160,
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 9 })));
    expect(onClose).toHaveBeenCalled();
  });

  it('a typed device-service URL skips the scan', async () => {
    const user = userEvent.setup();
    server.use(http.post('/api/v3/discovery/inspect', () => HttpResponse.json(inspectResult)));
    renderWithProviders(<DiscoveryDialog open onClose={() => {}} />);
    await user.type(screen.getByPlaceholderText(/onvif\/device_service/), 'http://10.0.0.5/onvif/device_service');
    expect(screen.getByText(/step 2 of 3/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^inspect$/i }));
    await screen.findByText('mainStream');
  });

  it('an inspect failure stays on the sign-in step with a message', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/v3/discovery/probe', () => HttpResponse.json(candidates)),
      http.post('/api/v3/discovery/inspect', () => HttpResponse.json({ error_message: 'forbidden' }, { status: 403 })),
    );
    renderWithProviders(<DiscoveryDialog open onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^scan$/i }));
    await user.click((await screen.findAllByRole('button', { name: /^inspect$/i }))[0]);
    await user.click(screen.getByRole('button', { name: /^inspect$/i }));
    await screen.findByRole('alert');
    expect(screen.getByText(/step 2 of 3/i)).toBeInTheDocument();
  });
});
