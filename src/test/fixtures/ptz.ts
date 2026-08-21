import type {
  AxisCapabilities,
  PanTiltCapabilities,
  PtzCapabilities,
  PtzStatusResponse,
} from '@/api/ptz';

const range = { min: 0, max: 100 };
const speed = { has_speed: true, min: 1, max: 10 };
const step = { min: 1, max: 10 };
const turbo = { has_turbo: false, speed: null };

function axis(overrides: Partial<AxisCapabilities> = {}): AxisCapabilities {
  return {
    can: true,
    can_abs: true,
    can_rel: true,
    can_con: true,
    can_auto: false,
    range,
    speed,
    step,
    ...overrides,
  };
}

function panTilt(overrides: Partial<PanTiltCapabilities> = {}): PanTiltCapabilities {
  return {
    can_move: true,
    can_pan: true,
    can_tilt: true,
    can_move_diag: true,
    can_move_abs: true,
    can_move_con: true,
    can_move_rel: true,
    can_move_map: false,
    pan_range: range,
    pan_speed: speed,
    pan_step: step,
    pan_turbo: turbo,
    tilt_range: range,
    tilt_speed: speed,
    tilt_step: step,
    tilt_turbo: turbo,
    ...overrides,
  };
}

/**
 * `GET /api/v3/ptz/monitors/{id}/capabilities` — a fully-capable PTZ head.
 * Every axis is a nested object, not a flat flag: `PtzControls` reads
 * `caps.pan_tilt.can_move` and `caps.zoom.can_con`, so a fixture that
 * flattens them crashes the page rather than failing an assertion.
 *
 * `monitor_id` is required by `PtzCapabilitiesResponse` but missing from
 * `PtzCapabilities` in `src/api/ptz.ts`; the fixture follows the spec and
 * widens its own return type rather than dropping a field the backend sends.
 */
export function makePtzCapabilities(
  overrides: Partial<PtzCapabilities & { monitor_id: number }> = {},
): PtzCapabilities & { monitor_id: number } {
  return { monitor_id: 1, ...capabilities(), ...overrides };
}

/** The bare `PtzCapabilities` object — what `PtzStatusResponse` embeds. */
function capabilities(overrides: Partial<PtzCapabilities> = {}): PtzCapabilities {
  return {
    control_id: 1,
    name: 'ONVIF PTZ',
    protocol: 'onvif',
    pan_tilt: panTilt(),
    zoom: axis(),
    focus: axis({ can_auto: true }),
    iris: axis({ can: false, can_abs: false, can_rel: false, can_con: false }),
    gain: axis({ can: false, can_abs: false, can_rel: false, can_con: false }),
    white_balance: axis({ can: false, can_abs: false, can_rel: false, can_con: false }),
    presets: { has_presets: true, num_presets: 8, can_set_presets: true, has_home_preset: true },
    power: { can_wake: false, can_sleep: false, can_reset: true, can_reboot: true },
    scan: { can_auto_scan: false, num_scan_paths: 0 },
    ...overrides,
  };
}

/** `GET /api/v3/ptz/monitors/{id}/status`. */
export function makePtzStatus(overrides: Partial<PtzStatusResponse> = {}): PtzStatusResponse {
  return {
    monitor_id: 1,
    available: true,
    is_native: true,
    protocol: 'onvif',
    capabilities: capabilities(),
    position: { pan: 0, tilt: 0, zoom: 0 },
    ...overrides,
  };
}
