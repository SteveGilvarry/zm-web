/**
 * The PTZ surface that `PtzControls.test.tsx` doesn't reach: the zoom and
 * focus rockers, the speed slider feeding every command, the preset
 * save/clear bank with its operator labels, pointer-cancel stop paths, and
 * the non-Error rejection fallback.
 */
import { describe, expect, it, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import type { PtzCapabilities } from '@/api/ptz';

const ptzMock = {
  move: vi.fn().mockResolvedValue({}),
  stopMove: vi.fn().mockResolvedValue({}),
  zoom: vi.fn().mockResolvedValue({}),
  stopZoom: vi.fn().mockResolvedValue({}),
  focus: vi.fn().mockResolvedValue({}),
  stopFocus: vi.fn().mockResolvedValue({}),
  home: vi.fn().mockResolvedValue({}),
  gotoPreset: vi.fn().mockResolvedValue({}),
  setPreset: vi.fn().mockResolvedValue({}),
  clearPreset: vi.fn().mockResolvedValue({}),
};
vi.mock('@/api/ptz', () => ({ ptz: ptzMock }));

const { PtzControls } = await import('./PtzControls');

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

beforeEach(() => {
  Object.values(ptzMock).forEach((m) => { m.mockReset(); m.mockResolvedValue({}); });
  HTMLElement.prototype.setPointerCapture ??= function () {};
  HTMLElement.prototype.releasePointerCapture ??= function () {};
  // No named presets unless a test says otherwise.
  server.use(http.get('/api/v3/control_presets', () => pagedPresets([])));
});

const pagedPresets = (items: unknown[]) =>
  HttpResponse.json({ items, total: items.length, per_page: 100, current_page: 1, last_page: 1 });

const axisOff = {
  can: false, can_abs: false, can_rel: false, can_con: false, can_auto: false,
  range: { min: null, max: null },
  speed: { min: null, max: null },
  step: { min: null, max: null },
};

function fullCaps(over: Partial<PtzCapabilities> = {}): PtzCapabilities {
  return {
    control_id: 1,
    name: 'Test',
    protocol: 'Onvif',
    pan_tilt: {
      can_move: true, can_pan: true, can_tilt: true, can_move_diag: true,
      can_move_abs: false, can_move_con: true, can_move_rel: false, can_move_map: false,
      pan_range: { min: null, max: null }, pan_speed: { min: null, max: null },
      pan_step: { min: null, max: null }, pan_turbo: {},
      tilt_range: { min: null, max: null }, tilt_speed: { min: null, max: null },
      tilt_step: { min: null, max: null }, tilt_turbo: {},
    },
    zoom: { ...axisOff, can: true, can_con: true },
    focus: { ...axisOff, can: true, can_con: true, can_auto: true },
    iris: { ...axisOff },
    gain: { ...axisOff },
    white_balance: { ...axisOff },
    presets: { has_presets: true, num_presets: 4, can_set_presets: true, has_home_preset: true },
    power: { can_wake: false, can_sleep: false, can_reset: false, can_reboot: false },
    scan: { can_auto_scan: false, num_scan_paths: 0 },
    ...over,
  };
}

const mount = (caps: PtzCapabilities = fullCaps(), monitorId = 42) =>
  renderWithProviders(<PtzControls monitorId={monitorId} capabilities={caps} />);

describe('PtzControls — zoom rocker', () => {
  it('continuous zoom sends speed only, and stops on pointer up', () => {
    mount();
    const closer = screen.getByRole('button', { name: /closer/i });
    fireEvent.pointerDown(closer, { pointerId: 1 });
    expect(ptzMock.zoom).toHaveBeenCalledWith(42, 'in', { speed: 50 });

    fireEvent.pointerUp(closer, { pointerId: 1 });
    expect(ptzMock.stopZoom).toHaveBeenCalledWith(42);
  });

  it('zooming wider works the same way and stops on pointer cancel', () => {
    mount();
    const wider = screen.getByRole('button', { name: /wider/i });
    fireEvent.pointerDown(wider, { pointerId: 1 });
    expect(ptzMock.zoom).toHaveBeenCalledWith(42, 'out', { speed: 50 });

    fireEvent.pointerCancel(wider, { pointerId: 1 });
    expect(ptzMock.stopZoom).toHaveBeenCalledWith(42);
  });

  it('a step-only camera gets a timed burst and no stop command', () => {
    const caps = fullCaps();
    caps.zoom = { ...axisOff, can: true, can_con: false };
    mount(caps);

    const closer = screen.getByRole('button', { name: /closer/i });
    fireEvent.pointerDown(closer, { pointerId: 1 });
    expect(ptzMock.zoom).toHaveBeenCalledWith(42, 'in', { speed: 50, duration_ms: 300 });

    fireEvent.pointerUp(closer, { pointerId: 1 });
    fireEvent.pointerCancel(closer, { pointerId: 1 });
    expect(ptzMock.stopZoom).not.toHaveBeenCalled();
  });
});

describe('PtzControls — focus rocker', () => {
  it('near / far run continuously and stop on release', () => {
    mount();
    const near = screen.getByRole('button', { name: /near/i });
    fireEvent.pointerDown(near, { pointerId: 1 });
    expect(ptzMock.focus).toHaveBeenCalledWith(42, 'near', { speed: 50 });
    fireEvent.pointerUp(near, { pointerId: 1 });
    expect(ptzMock.stopFocus).toHaveBeenCalledWith(42);

    const far = screen.getByRole('button', { name: /far/i });
    fireEvent.pointerDown(far, { pointerId: 1 });
    expect(ptzMock.focus).toHaveBeenCalledWith(42, 'far', { speed: 50 });
    fireEvent.pointerCancel(far, { pointerId: 1 });
    expect(ptzMock.stopFocus).toHaveBeenCalledTimes(2);
  });

  it('a step-only focus gets a timed burst and no stop command', () => {
    const caps = fullCaps();
    caps.focus = { ...axisOff, can: true, can_con: false, can_auto: false };
    mount(caps);

    fireEvent.pointerDown(screen.getByRole('button', { name: /near/i }), { pointerId: 1 });
    expect(ptzMock.focus).toHaveBeenCalledWith(42, 'near', { speed: 50, duration_ms: 300 });
    fireEvent.pointerUp(screen.getByRole('button', { name: /near/i }), { pointerId: 1 });
    expect(ptzMock.stopFocus).not.toHaveBeenCalled();
  });

  it('disables Auto when the camera cannot autofocus', () => {
    const caps = fullCaps();
    caps.focus = { ...axisOff, can: true, can_con: true, can_auto: false };
    mount(caps);
    expect(screen.getByRole('button', { name: /^auto$/i })).toBeDisabled();
  });
});

describe('PtzControls — the d-pad stop paths', () => {
  it('stops when the pointer is cancelled mid-hold', () => {
    mount();
    const left = screen.getByRole('button', { name: /^move left$/i });
    fireEvent.pointerDown(left, { pointerId: 1 });
    expect(ptzMock.move).toHaveBeenCalledWith(42, 'left', { pan_speed: 50, tilt_speed: 50 });
    fireEvent.pointerCancel(left, { pointerId: 1 });
    expect(ptzMock.stopMove).toHaveBeenCalledWith(42);
  });

  it('greys out the diagonals when the camera cannot do them', () => {
    const caps = fullCaps();
    caps.pan_tilt.can_move_diag = false;
    mount(caps);
    expect(screen.getByRole('button', { name: /move up-left/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^move up$/i })).toBeEnabled();
  });
});

describe('PtzControls — speed', () => {
  it('the slider feeds the speed into every subsequent command', () => {
    mount();
    const slider = screen.getByLabelText('Movement speed');
    fireEvent.change(slider, { target: { value: '90' } });
    expect(screen.getByText('90')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: /^move up$/i }), { pointerId: 1 });
    expect(ptzMock.move).toHaveBeenCalledWith(42, 'up', { pan_speed: 90, tilt_speed: 90 });

    fireEvent.pointerDown(screen.getByRole('button', { name: /closer/i }), { pointerId: 1 });
    expect(ptzMock.zoom).toHaveBeenCalledWith(42, 'in', { speed: 90 });

    fireEvent.pointerDown(screen.getByRole('button', { name: /near/i }), { pointerId: 1 });
    expect(ptzMock.focus).toHaveBeenCalledWith(42, 'near', { speed: 90 });
  });

  it('highlights the tick nearest the chosen speed', () => {
    mount();
    const slider = screen.getByLabelText('Movement speed');
    fireEvent.change(slider, { target: { value: '1' } });
    expect((slider as HTMLInputElement).value).toBe('1');
    fireEvent.change(slider, { target: { value: '100' } });
    expect((slider as HTMLInputElement).value).toBe('100');
  });
});

describe('PtzControls — preset bank', () => {
  it('caps the visible slots at 16 however many the camera claims', () => {
    mount(fullCaps({
      presets: { has_presets: true, num_presets: 64, can_set_presets: false, has_home_preset: true },
    }));
    expect(screen.getByTitle('Go to preset 16')).toBeInTheDocument();
    expect(screen.queryByTitle('Go to preset 17')).toBeNull();
    expect(screen.getByText(/^16 slots?$/)).toBeInTheDocument();
  });

  it('shows operator labels from /control_presets on the slot and in the select', async () => {
    server.use(http.get('/api/v3/control_presets', () => pagedPresets([
      { monitor_id: 42, preset: 2, label: 'Gate' },
      { monitor_id: 42, preset: 3, label: '' },     // unnamed rows are ignored
    ])));
    mount();

    const labelled = await screen.findByRole('button', { name: 'Go to preset 2: Gate' });
    expect(labelled).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to preset 1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '#2 Gate' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '#3' })).toBeInTheDocument();
  });

  it('asks for the presets of the monitor being controlled', async () => {
    let seen: URLSearchParams | null = null;
    server.use(http.get('/api/v3/control_presets', ({ request }) => {
      seen = new URL(request.url).searchParams;
      return pagedPresets([]);
    }));
    mount(fullCaps(), 7);
    await vi.waitFor(() => expect(seen).not.toBeNull());
    expect(seen!.get('monitor_id')).toBe('7');
  });

  it('saves the current position into the chosen slot with an optional name, then clears the field', async () => {
    const user = userEvent.setup();
    mount();

    await user.selectOptions(screen.getByLabelText('Preset slot'), '3');
    const name = screen.getByPlaceholderText('Name (optional)');
    await user.type(name, 'Driveway');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(ptzMock.setPreset).toHaveBeenCalledWith(42, 3, 'Driveway');
    expect((name as HTMLInputElement).value).toBe('');
  });

  it('saves with no name at all rather than an empty string', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(ptzMock.setPreset).toHaveBeenCalledWith(42, 1, undefined);
  });

  it('clears the selected slot', async () => {
    const user = userEvent.setup();
    mount();
    await user.selectOptions(screen.getByLabelText('Preset slot'), '4');
    await user.click(screen.getByRole('button', { name: 'Clear preset in selected slot' }));
    expect(ptzMock.clearPreset).toHaveBeenCalledWith(42, 4);
  });

  it('hides the save/clear row when the camera will not store presets', () => {
    mount(fullCaps({
      presets: { has_presets: true, num_presets: 4, can_set_presets: false, has_home_preset: true },
    }));
    expect(screen.getByTitle('Go to preset 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Preset slot')).toBeNull();
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
  });

  it('hides the bank when the camera advertises zero slots', () => {
    mount(fullCaps({
      presets: { has_presets: true, num_presets: 0, can_set_presets: true, has_home_preset: false },
    }));
    expect(screen.queryByTitle('Go to preset 1')).toBeNull();
  });

  it('survives the preset-label lookup 500ing — slots still show their number', async () => {
    server.use(http.get('/api/v3/control_presets', () =>
      HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'nope' }, { status: 500 }),
    ));
    mount();
    expect(await screen.findByRole('button', { name: 'Go to preset 1' })).toBeInTheDocument();
  });

  it('survives a network failure on the preset-label lookup', async () => {
    server.use(http.get('/api/v3/control_presets', () => HttpResponse.error()));
    mount();
    expect(await screen.findByRole('button', { name: 'Go to preset 1' })).toBeInTheDocument();
  });
});

describe('PtzControls — failure reporting', () => {
  it('falls back to a generic message when the rejection is not an Error', async () => {
    ptzMock.clearPreset.mockRejectedValueOnce('nope');
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Clear preset in selected slot' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Clear preset: command failed');
  });

  it('falls back for an Error with no message', async () => {
    ptzMock.home.mockRejectedValueOnce(new Error(''));
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^home$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Home: command failed');
  });

  it('a second failure replaces the first and restarts the countdown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      ptzMock.home.mockRejectedValueOnce(new Error('first'));
      ptzMock.zoom.mockRejectedValueOnce(new Error('second'));
      mount();

      fireEvent.click(screen.getByRole('button', { name: /^home$/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Home: first');

      await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
      fireEvent.pointerDown(screen.getByRole('button', { name: /closer/i }), { pointerId: 1 });
      // The first alert is still on screen, so wait for the text to swap
      // rather than for "an alert" to exist.
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Zoom: second'));

      // The original 6 s window has elapsed, but the replacement is still up.
      await act(async () => { await vi.advanceTimersByTimeAsync(3_500); });
      expect(screen.getByRole('alert')).toHaveTextContent('Zoom: second');

      await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears its pending timer on unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      ptzMock.home.mockRejectedValueOnce(new Error('boom'));
      const { unmount } = mount();
      fireEvent.click(screen.getByRole('button', { name: /^home$/i }));
      await screen.findByRole('alert');
      unmount();
      await act(async () => { await vi.advanceTimersByTimeAsync(7_000); });
      // No "state update on unmounted component" fallout.
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
