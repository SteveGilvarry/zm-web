import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { AddMonitorDialog } from './AddMonitorDialog';
import { useAuthStore } from '@/stores/auth';

const page = <T,>(items: T[]) => ({ items, total: items.length, per_page: 500, current_page: 1, last_page: 1 });

// The preset picker lists /monitor_presets.
const server = setupServer(
  http.get('/api/v3/monitor_presets', () => HttpResponse.json(page([
    {
      id: 1, model_id: null, name: 'Amcrest, IP8M-T2499EW 640x480, RTP/RTSP', type: 'Ffmpeg',
      device: 'rtsp', channel: 0, format: 255, protocol: 'rtsp', method: 'rtpRtsp', host: 'NULL', port: '554',
      path: 'rtsp://<username>:<password>@<ip-address>/cam/realmonitor?channel=1&subtype=1', sub_path: null,
      width: 640, height: 480, palette: 3, max_fps: null, controllable: 0, control_id: null,
      control_device: null, control_address: null, default_rate: 100, default_scale: '100',
    },
  ]))),
);
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: { iat: 0, exp: 0, user: 'admin' }, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'bypass' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const postSpy = () => {
  let body: Record<string, unknown> | null = null;
  server.use(http.post('/api/v3/monitors', async ({ request }) => {
    body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ id: 42, ...body });
  }));
  return () => body;
};

describe('AddMonitorDialog — visibility', () => {
  it('renders nothing when open=false', () => {
    const { container } = renderWithProviders(
      <AddMonitorDialog open={false} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the dialog when open=true', () => {
    renderWithProviders(
      <AddMonitorDialog open={true} onClose={() => {}} />,
    );
    expect(screen.getByRole('dialog', { name: /add monitor/i })).toBeInTheDocument();
  });
});

describe('AddMonitorDialog — form validation', () => {
  it('disables the submit button while the name is empty', () => {
    renderWithProviders(
      <AddMonitorDialog open={true} onClose={() => {}} />,
    );
    expect(screen.getByRole('button', { name: /create monitor/i })).toBeDisabled();
  });

  it('enables the submit button as soon as the name has content', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AddMonitorDialog open={true} onClose={() => {}} />,
    );

    const nameInput = screen.getByPlaceholderText(/front door/i);
    await user.type(nameInput, 'New Camera');

    expect(screen.getByRole('button', { name: /create monitor/i })).toBeEnabled();
  });

  it('refuses a zero resolution and a non-numeric port without POSTing', async () => {
    const user = userEvent.setup();
    const body = postSpy();
    renderWithProviders(<AddMonitorDialog open={true} onClose={() => {}} />);
    await user.type(screen.getByPlaceholderText(/front door/i), 'Cam');
    fireEvent.change(screen.getByLabelText('Width (px)'), { target: { value: '0' } });
    await user.click(screen.getByRole('button', { name: /create monitor/i }));
    expect(screen.getAllByRole('alert').some((el) => /at least 1/.test(el.textContent ?? ''))).toBe(true);
    expect(body()).toBeNull();
  });
});

describe('AddMonitorDialog — submit', () => {
  it('POSTs /monitors with the form values + spreads defaults', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const body = postSpy();

    renderWithProviders(
      <AddMonitorDialog open={true} onClose={onClose} />,
    );

    await user.type(screen.getByPlaceholderText(/front door/i), 'Garage');
    await user.click(screen.getByRole('button', { name: /create monitor/i }));

    await waitFor(() => expect(body()?.name).toBe('Garage'));
    // Defaults were spread in (random representative check).
    expect(body()!.image_buffer_count).toBeDefined();
    expect(body()!.section_length).toBeDefined();
    // 0 is ZoneMinder's "Default" storage area, not a missing value.
    expect(body()!.storage_id).toBe(0);
  });

  it('omits the camera password when the operator leaves it blank', async () => {
    const user = userEvent.setup();
    const body = postSpy();

    renderWithProviders(<AddMonitorDialog open={true} onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/front door/i), 'Garage');
    await user.click(screen.getByRole('button', { name: /create monitor/i }));

    // Falls through to the defaults blob's blank rather than the form's ''.
    await waitFor(() => expect(body()?.name).toBe('Garage'));
    expect(body()!.pass).toBe('');
  });

  it('sends the camera password the operator typed', async () => {
    const user = userEvent.setup();
    const body = postSpy();

    renderWithProviders(<AddMonitorDialog open={true} onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/front door/i), 'Garage');
    await user.type(screen.getByPlaceholderText(/^pass$/i), 'hunter2');
    await user.click(screen.getByRole('button', { name: /create monitor/i }));

    await waitFor(() => expect(body()?.name).toBe('Garage'));
    expect(body()!.pass).toBe('hunter2');
  });

  it('closes the dialog and reports the created monitor', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCreated = vi.fn();
    postSpy();

    renderWithProviders(
      <AddMonitorDialog open={true} onClose={onClose} onCreated={onCreated} />,
    );
    await user.type(screen.getByPlaceholderText(/front door/i), 'Garage');
    await user.click(screen.getByRole('button', { name: /create monitor/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 42, name: 'Garage' }));
  });

  it('surfaces a backend error and stays open', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    server.use(
      http.post('/api/v3/monitors', () =>
        HttpResponse.json({ message: 'monitor name already taken' }, { status: 400 }),
      ),
    );

    renderWithProviders(
      <AddMonitorDialog open={true} onClose={onClose} />,
    );
    await user.type(screen.getByPlaceholderText(/front door/i), 'Dup');
    await user.click(screen.getByRole('button', { name: /create monitor/i }));

    // Error caption rendered; dialog still open (onClose not called).
    await waitFor(() => expect(screen.getByText(/already taken/i)).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('marks the field a 422 names', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/v3/monitors', () =>
        HttpResponse.json({ error_message: 'validation failed', details: [['width', 'lower than 1']] }, { status: 422 }),
      ),
    );
    renderWithProviders(<AddMonitorDialog open={true} onClose={() => {}} />);
    await user.type(screen.getByPlaceholderText(/front door/i), 'Cam');
    await user.click(screen.getByRole('button', { name: /create monitor/i }));
    await waitFor(() => expect(screen.getByLabelText('Width (px)')).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getAllByRole('alert').some((el) => /lower than 1/.test(el.textContent ?? ''))).toBe(true);
  });
});

describe('AddMonitorDialog — source types', () => {
  it('offers all eight source types and swaps the source rows', async () => {
    renderWithProviders(<AddMonitorDialog open={true} onClose={() => {}} />);
    const typeSelect = screen.getByDisplayValue(/FFmpeg/) as HTMLSelectElement;
    expect(Array.from(typeSelect.options).map((o) => o.value)).toEqual(['Ffmpeg', 'Libvlc', 'Remote', 'Local', 'File', 'Curl', 'WebSite', 'Vnc']);

    // FFmpeg: path + auth, no host.
    expect(screen.getByText('Path')).toBeInTheDocument();
    expect(screen.queryByText('Host')).not.toBeInTheDocument();

    fireEvent.change(typeSelect, { target: { value: 'Local' } });
    expect(screen.getByPlaceholderText('/dev/video0')).toBeInTheDocument();
    expect(screen.queryByText('Auth')).not.toBeInTheDocument();

    fireEvent.change(typeSelect, { target: { value: 'Remote' } });
    expect(screen.getByText('Host')).toBeInTheDocument();
    expect(screen.getByText('Protocol')).toBeInTheDocument();

    fireEvent.change(typeSelect, { target: { value: 'WebSite' } });
    expect(screen.getByText('URL')).toBeInTheDocument();
    expect(screen.getByText('Refresh (s)')).toBeInTheDocument();
  });

  it('POSTs the Local device and the chosen type', async () => {
    const user = userEvent.setup();
    const body = postSpy();
    renderWithProviders(<AddMonitorDialog open={true} onClose={() => {}} />);
    await user.type(screen.getByPlaceholderText(/front door/i), 'Capture card');
    fireEvent.change(screen.getByDisplayValue(/FFmpeg/), { target: { value: 'Local' } });
    await user.type(screen.getByPlaceholderText('/dev/video0'), '/dev/video2');
    await user.click(screen.getByRole('button', { name: /create monitor/i }));
    await waitFor(() => expect(body()).toMatchObject({ type: 'Local', device: '/dev/video2' }));
  });
});

describe('AddMonitorDialog — presets and prefill', () => {
  it('applying a preset copies its source settings into the form', async () => {
    const user = userEvent.setup();
    const body = postSpy();
    renderWithProviders(<AddMonitorDialog open={true} onClose={() => {}} />);
    const picker = await screen.findByRole('option', { name: /Amcrest/ });
    fireEvent.change(picker.closest('select')!, { target: { value: '1' } });

    expect(screen.getByLabelText('Width (px)')).toHaveValue(640);
    expect(screen.getByLabelText('Height (px)')).toHaveValue(480);
    expect(screen.getByDisplayValue(/cam\/realmonitor/)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/front door/i), 'Amcrest');
    await user.click(screen.getByRole('button', { name: /create monitor/i }));
    await waitFor(() => expect(body()).toMatchObject({
      type: 'Ffmpeg', method: 'rtpRtsp', protocol: 'rtsp', port: '554', width: 640, height: 480, palette: 3, default_scale: '100',
    }));
    // The preset's literal "NULL" host never reaches the payload.
    expect(body()!.host).toBe('');
  });

  it('starts from `initial` values (what discovery hands over)', async () => {
    renderWithProviders(
      <AddMonitorDialog
        open={true}
        onClose={() => {}}
        initial={{ name: 'Porch', type: 'Ffmpeg', path: 'rtsp://10.0.0.5/live', width: 1280, height: 720, onvif_url: 'http://10.0.0.5/onvif/device_service' }}
      />,
    );
    expect(screen.getByDisplayValue('Porch')).toBeInTheDocument();
    expect(screen.getByDisplayValue('rtsp://10.0.0.5/live')).toBeInTheDocument();
    expect(screen.getByLabelText('Width (px)')).toHaveValue(1280);
  });
});

describe('AddMonitorDialog — close button', () => {
  it('calls onClose without submitting when the X is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <AddMonitorDialog open={true} onClose={onClose} />,
    );
    await user.click(screen.getByRole('button', { name: /^close$/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
