/**
 * Modern editor: the Actions panel (add / remove / save per row), the
 * encoder template picker, the Current level meter and the streaming rows.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import type { Monitor } from '@/types';

const page = <T,>(items: T[]) => ({ items, total: items.length, per_page: 500, current_page: 1, last_page: 1 });
const STORED = {
  id: 21, monitor_id: 1, target_monitor_id: 8, action_type: 'LightOn', trigger_on: 'Alarm', audio_file: null,
  label: 'Porch light', enabled: true, sequence: 0,
};

const server = setupServer(
  http.get('/api/v3/monitors', () => HttpResponse.json(page([]))),
  http.get('/api/v3/groups', () => HttpResponse.json(page([]))),
  http.get('/api/v3/groups-monitors', () => HttpResponse.json(page([]))),
  http.get('/api/v3/encoder-templates', () => HttpResponse.json([
    { id: 1, encoder: 'libx264', name: 'Balanced', description: null, params: 'preset=fast\ncrf=23' },
  ])),
  http.get('/api/v3/monitors/1/actions', () => HttpResponse.json([STORED])),
  http.get('/api/v3/monitors/1/actions/targets', () => HttpResponse.json([
    { id: 7, name: 'Hall speaker', device_class: 'Speaker', types: ['AudioPlay', 'AudioStop'], min_audio_file: 1, max_audio_file: 5 },
    { id: 8, name: 'Porch cam', device_class: 'Camera', types: ['LightOn', 'LightOff'], min_audio_file: null, max_audio_file: null },
  ])),
  http.get('/api/v3/monitors/1/audio-level', () => HttpResponse.json({ level: 64, alarm: true, threshold: 50, detection: true })),
);
beforeAll(() => {
  useAuthStore.setState({ accessToken: 'test', refreshToken: 'test', user: { iat: 0, exp: 0, user: 'admin' }, isAuthenticated: true });
  server.listen({ onUnhandledFrame: 'bypass' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to ?? '#'}>{children}</a>,
}));

const { MonitorEditor } = await import('./MonitorEditor');

const monitor = {
  id: 1, name: 'Front Door', type: 'Ffmpeg', device_class: 'Camera', path: 'rtsp://10.0.0.1/main', width: 1920, height: 1080,
  video_writer: 1, output_codec: 0, encoder: 'libx264', encoder_parameters: '', audio_threshold: 50,
  go2rtc_enabled: 0, rtsp2_web_enabled: 0, janus_enabled: 0, default_player: '', stream_channel: 'Restream',
  what_display: 'OnlyVideo', deleted: false,
} as unknown as Monitor;

const tab = (name: RegExp) => within(screen.getByRole('navigation', { name: 'Edit sections' })).getByRole('button', { name });

describe('MonitorEditor — Actions panel', () => {
  it('adds, edits and removes rows, then saves each change as its own call', async () => {
    const user = userEvent.setup();
    const sent: string[] = [];
    let created: unknown = null;
    server.use(
      http.delete('/api/v3/monitors/1/actions/21', () => { sent.push('DELETE 21'); return new HttpResponse(null, { status: 204 }); }),
      http.post('/api/v3/monitors/1/actions', async ({ request }) => {
        created = await request.json();
        sent.push('POST');
        return HttpResponse.json({ ...STORED, id: 22 });
      }),
    );
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(tab(/^actions/i));
    expect(await screen.findByDisplayValue('Porch light')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add action' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Action 2: Device' }), '7');
    expect(screen.getByRole('spinbutton', { name: 'Action 2: Sound' })).toHaveValue(1);
    await user.type(screen.getByRole('textbox', { name: 'Action 2: Label' }), 'Chime');
    await user.click(screen.getByRole('button', { name: 'Action 1: Remove' }));
    expect(screen.getByText(/^2 unsaved change/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^save 2$/i }));
    await waitFor(() => expect(sent).toEqual(['DELETE 21', 'POST']));
    expect(created).toEqual({
      target_monitor_id: 7, action_type: 'AudioPlay', trigger_on: 'EventStart', audio_file: 1, label: 'Chime', enabled: true, sequence: 1,
    });
  });
});

describe('MonitorEditor — Recording, Analysis and Viewing additions', () => {
  it('applies an encoder template into the parameters', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(tab(/^recording/i));
    await screen.findByRole('combobox', { name: 'Encoder Template' });
    await user.click(screen.getByRole('button', { name: 'Apply template' }));
    expect(screen.getByRole('textbox', { name: 'Encoder parameters' })).toHaveValue('preset=fast\ncrf=23');
    expect(screen.getByRole('textbox', { name: 'Encoder hardware acceleration' })).toBeInTheDocument();
    // Encoding: no wall-clock toggle.
    expect(screen.queryByRole('switch', { name: /wall-clock/i })).toBeNull();
  });

  it('shows the live level over the threshold as an alarm', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(tab(/^analysis/i));
    const meter = screen.getByRole('meter', { name: 'Current Level' });
    await waitFor(() => expect(meter).toHaveAttribute('aria-valuenow', '64'));
    expect(screen.getByText('64')).toHaveClass('text-danger');
    expect(screen.getByTestId('audio-threshold-mark')).toHaveStyle({ left: '50%' });
  });

  it('Go2RTC shows Stream source and offers its players', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(tab(/^viewing/i));
    expect(screen.queryByRole('combobox', { name: 'Stream source' })).toBeNull();
    const toggles = screen.getAllByRole('switch');
    await user.click(toggles.find((el) => el.closest('div')?.textContent?.includes('Go2RTC'))!);
    expect(screen.getByRole('combobox', { name: 'Stream source' })).toBeInTheDocument();
    const player = screen.getByRole('combobox', { name: 'Default player' }) as HTMLSelectElement;
    expect(Array.from(player.options).map((o) => o.value)).toContain('go2rtc_webrtc');
    expect(screen.getByRole('combobox', { name: 'Show' })).toHaveValue('OnlyVideo');
  });
});
