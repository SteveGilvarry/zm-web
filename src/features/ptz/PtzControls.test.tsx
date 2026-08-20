import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PtzCapabilities } from '@/api/ptz';

// Mock the PTZ API module so the component never issues real fetches; we
// assert on call arguments instead.
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
      can_move: true,
      can_pan: true,
      can_tilt: true,
      can_move_diag: true,
      can_move_abs: false,
      can_move_con: true,    // continuous-capable
      can_move_rel: false,
      can_move_map: false,
      pan_range: { min: null, max: null },
      pan_speed: { min: null, max: null },
      pan_step: { min: null, max: null },
      pan_turbo: {},
      tilt_range: { min: null, max: null },
      tilt_speed: { min: null, max: null },
      tilt_step: { min: null, max: null },
      tilt_turbo: {},
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

beforeEach(() => {
  Object.values(ptzMock).forEach((m) => m.mockClear());
  // jsdom doesn't implement Element.setPointerCapture; the component calls
  // it inside pointerDown handlers, so stub it out.
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = function () {};
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = function () {};
  }
});

describe('PtzControls — capability gating', () => {
  it('omits the D-pad when can_move=false', () => {
    const caps = fullCaps();
    caps.pan_tilt.can_move = false;
    render(<PtzControls monitorId={1} capabilities={caps} />);
    expect(screen.queryByRole('button', { name: /move up/i })).toBeNull();
  });

  it('omits the Zoom section when caps.zoom.can=false', () => {
    const caps = fullCaps();
    caps.zoom = { ...axisOff };
    render(<PtzControls monitorId={1} capabilities={caps} />);
    expect(screen.queryByText(/zoom/i)).toBeNull();
  });

  it('omits the Focus section when caps.focus.can=false', () => {
    const caps = fullCaps();
    caps.focus = { ...axisOff };
    render(<PtzControls monitorId={1} capabilities={caps} />);
    // Focus heading shouldn't render — neither should Auto/Near/Far buttons.
    expect(screen.queryByText('Near')).toBeNull();
    expect(screen.queryByText('Far')).toBeNull();
  });

  it('omits the Presets section when has_presets=false', () => {
    const caps = fullCaps({
      presets: { has_presets: false, num_presets: 0, can_set_presets: false, has_home_preset: false },
    });
    render(<PtzControls monitorId={1} capabilities={caps} />);
    expect(screen.queryByText(/presets/i)).toBeNull();
  });
});

describe('PtzControls — D-pad continuous vs step', () => {
  it('continuous move: pointerDown → ptz.move({pan,tilt} only); pointerUp → ptz.stopMove', () => {
    const caps = fullCaps();
    render(<PtzControls monitorId={42} capabilities={caps} />);

    const upBtn = screen.getByRole('button', { name: /^move up$/i });
    fireEvent.pointerDown(upBtn, { pointerId: 1 });

    expect(ptzMock.move).toHaveBeenCalledWith(42, 'up', { pan_speed: 50, tilt_speed: 50 });

    fireEvent.pointerUp(upBtn, { pointerId: 1 });
    expect(ptzMock.stopMove).toHaveBeenCalledWith(42);
  });

  it('step (non-continuous) move: pointerDown adds duration_ms and pointerUp does NOT call stopMove', () => {
    const caps = fullCaps();
    caps.pan_tilt.can_move_con = false; // step-only camera
    render(<PtzControls monitorId={42} capabilities={caps} />);

    const upBtn = screen.getByRole('button', { name: /^move up$/i });
    fireEvent.pointerDown(upBtn, { pointerId: 1 });

    expect(ptzMock.move).toHaveBeenCalledWith(
      42, 'up',
      expect.objectContaining({ pan_speed: 50, tilt_speed: 50, duration_ms: 300 }),
    );

    fireEvent.pointerUp(upBtn, { pointerId: 1 });
    expect(ptzMock.stopMove).not.toHaveBeenCalled();
  });
});

describe('PtzControls — Home + presets', () => {
  it('calls ptz.home(monitorId) on Home button click', async () => {
    const user = userEvent.setup();
    render(<PtzControls monitorId={42} capabilities={fullCaps()} />);
    await user.click(screen.getByRole('button', { name: /^home$/i }));
    expect(ptzMock.home).toHaveBeenCalledWith(42);
  });

  it('clicking preset slot N calls ptz.gotoPreset(monitorId, N)', async () => {
    const user = userEvent.setup();
    render(<PtzControls monitorId={42} capabilities={fullCaps()} />);
    // Preset slot buttons advertise their accessible name via title attribute.
    await user.click(screen.getByTitle('Go to preset 2'));
    expect(ptzMock.gotoPreset).toHaveBeenCalledWith(42, 2);
  });
});

describe('PtzControls — Focus Auto', () => {
  it('calls ptz.focus(monitorId, "auto") when the Auto button is clicked', async () => {
    const user = userEvent.setup();
    render(<PtzControls monitorId={42} capabilities={fullCaps()} />);
    await user.click(screen.getByRole('button', { name: /^auto$/i }));
    expect(ptzMock.focus).toHaveBeenCalledWith(42, 'auto');
  });
});

describe('PtzControls — command failures are shown, not swallowed', () => {
  it('renders the rejected command inline and clears it after a few seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      ptzMock.home.mockRejectedValueOnce(new Error('Camera unreachable'));
      render(<PtzControls monitorId={1} capabilities={fullCaps()} />);
      fireEvent.click(screen.getByRole('button', { name: /^home$/i }));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Home: Camera unreachable');
      await act(async () => { await vi.advanceTimersByTimeAsync(6_100); });
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failed move during press-and-hold is reported too', async () => {
    ptzMock.move.mockRejectedValueOnce(new Error('timeout'));
    render(<PtzControls monitorId={1} capabilities={fullCaps()} />);
    const up = screen.getByRole('button', { name: /move up$/i });
    (up as HTMLElement & { setPointerCapture: () => void }).setPointerCapture = () => {};
    fireEvent.pointerDown(up, { pointerId: 1 });
    expect(await screen.findByRole('alert')).toHaveTextContent('Move: timeout');
  });
});
