/**
 * The light, indicator and audio clusters (control_functions.php
 * `controlLight`, `controlIndicatorLight`, `controlAudio`; zm-api#190).
 */
import { describe, expect, it, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import type { UserClaims } from '@/types';
import type { PtzCapabilities } from '@/api/ptz';

const ptzMock = {
  getLightStatus: vi.fn(),
  light: vi.fn().mockResolvedValue({}),
  indicatorLight: vi.fn().mockResolvedValue({}),
  playAudio: vi.fn().mockResolvedValue({}),
  stopAudio: vi.fn().mockResolvedValue({}),
  audioVolume: vi.fn().mockResolvedValue({}),
};
vi.mock('@/api/ptz', () => ({ ptz: ptzMock }));

const { PtzControls } = await import('./PtzControls');

const ADMIN = {
  iat: 0, exp: 0, user: 'admin',
  perms: { stream: 'Edit', events: 'Edit', control: 'Edit', monitors: 'Edit' },
} as unknown as UserClaims;

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: ADMIN, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});
beforeEach(() => {
  Object.values(ptzMock).forEach((m) => { m.mockReset(); m.mockResolvedValue({}); });
  ptzMock.getLightStatus.mockResolvedValue({ light: null, indicator_light: null });
  server.use(http.get('/api/v3/control_presets', () =>
    HttpResponse.json({ items: [], total: 0, per_page: 100, current_page: 1, last_page: 1 })));
});

const axisOff = {
  can: false, can_abs: false, can_rel: false, can_con: false, can_auto: false,
  range: { min: null, max: null }, speed: { min: null, max: null }, step: { min: null, max: null },
};

/** A control with nothing but what the test adds. */
function caps(over: Partial<PtzCapabilities> = {}): PtzCapabilities {
  return {
    control_id: 1, name: 'Speaker', protocol: 'AxisV2',
    pan_tilt: {
      can_move: false, can_pan: false, can_tilt: false, can_move_diag: false,
      can_move_abs: false, can_move_con: false, can_move_rel: false, can_move_map: false,
      pan_range: { min: null, max: null }, pan_speed: { min: null, max: null },
      pan_step: { min: null, max: null }, pan_turbo: {},
      tilt_range: { min: null, max: null }, tilt_speed: { min: null, max: null },
      tilt_step: { min: null, max: null }, tilt_turbo: {},
    },
    zoom: axisOff, focus: axisOff, iris: axisOff, gain: axisOff, white_balance: axisOff,
    presets: { has_presets: false, num_presets: 0, can_set_presets: false, has_home_preset: false },
    power: { can_wake: false, can_sleep: false, can_reset: false, can_reboot: false },
    scan: { can_auto_scan: false, num_scan_paths: 0 },
    ...over,
  } as PtzCapabilities;
}

const mount = (c: PtzCapabilities) => renderWithProviders(<PtzControls monitorId={6} capabilities={c} variant="classic" />);

describe('PtzControls — light and indicator', () => {
  it('draws nothing for a control without them, and asks the camera nothing', () => {
    mount(caps());
    expect(screen.queryByRole('button', { name: 'Light' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Indicator' })).toBeNull();
    expect(ptzMock.getLightStatus).not.toHaveBeenCalled();
  });

  it('starts from the camera\'s state and sends the opposite, then asks again', async () => {
    ptzMock.getLightStatus.mockResolvedValue({ light: 'off', indicator_light: 'On' });
    const user = userEvent.setup();
    mount(caps({ light: { can_light: true, can_indicator_light: true } }));
    const light = screen.getByRole('button', { name: 'Light' });
    const indicator = screen.getByRole('button', { name: 'Indicator' });
    await waitFor(() => expect(indicator).toHaveAttribute('aria-pressed', 'true'));
    expect(light).toHaveAttribute('aria-pressed', 'false');

    await user.click(light);
    expect(ptzMock.light).toHaveBeenCalledWith(6, 'on');
    await user.click(indicator);
    expect(ptzMock.indicatorLight).toHaveBeenCalledWith(6, 'off');
    // watch.js re-queries 800 ms after each click: once on load, once per click.
    await waitFor(() => expect(ptzMock.getLightStatus).toHaveBeenCalledTimes(3), { timeout: 2_000 });
  });

  it('sends On while the state is unknown, as legacy\'s untouched button does', async () => {
    ptzMock.getLightStatus.mockRejectedValue(new Error('no daemon'));
    const user = userEvent.setup();
    mount(caps({ light: { can_light: true, can_indicator_light: false } }));
    await user.click(screen.getByRole('button', { name: 'Light' }));
    expect(ptzMock.light).toHaveBeenCalledWith(6, 'on');
  });

  it('shows a failed switch under the pad', async () => {
    ptzMock.light.mockRejectedValue(new Error('camera unreachable'));
    const user = userEvent.setup();
    mount(caps({ light: { can_light: true, can_indicator_light: false } }));
    await user.click(screen.getByRole('button', { name: 'Light' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Light: camera unreachable');
  });
});

describe('PtzControls — audio', () => {
  it('numbers a button per sound from min to max, with Stop and the volume pair', async () => {
    const user = userEvent.setup();
    mount(caps({ audio: { can_play: true, can_volume: true, min_file: 3, max_file: 5 } }));
    const sounds = screen.getByRole('group', { name: 'Sounds' });
    expect(within(sounds).getAllByRole('button').map((b) => b.textContent)).toEqual(['3', '4', '5']);

    await user.click(within(sounds).getByRole('button', { name: 'Play sound 4' }));
    expect(ptzMock.playAudio).toHaveBeenCalledWith(6, 4);
    await user.click(screen.getByRole('button', { name: 'Stop Audio' }));
    expect(ptzMock.stopAudio).toHaveBeenCalledWith(6);
    await user.click(screen.getByRole('button', { name: 'Volume down' }));
    expect(ptzMock.audioVolume).toHaveBeenCalledWith(6, 'down');
    await user.click(screen.getByRole('button', { name: 'Volume up' }));
    expect(ptzMock.audioVolume).toHaveBeenCalledWith(6, 'up');
  });

  it('keeps Stop but no numbers when the file range is missing or backwards', () => {
    mount(caps({ audio: { can_play: true, can_volume: false, min_file: 9, max_file: 2 } }));
    expect(screen.queryByRole('group', { name: 'Sounds' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Stop Audio' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Volume up' })).toBeNull();
  });

  it('offers only the volume pair to a control that cannot play', () => {
    mount(caps({ audio: { can_play: false, can_volume: true, min_file: 1, max_file: 3 } }));
    expect(screen.queryByRole('button', { name: 'Stop Audio' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Sounds' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Volume down' })).toBeInTheDocument();
  });
});
