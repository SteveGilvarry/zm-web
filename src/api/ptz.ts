import { apiGet, apiPost, apiDelete } from './client';

// --- Sub-capability schemas (mirror PTZ OpenAPI components) ---

export interface AxisRange { min: number | null; max: number | null }
export interface AxisSpeed { min: number | null; max: number | null }
export interface AxisStep { min: number | null; max: number | null }
/** Opaque turbo-speed payload — present in the API schema but not used in the UI. */
export type TurboSpeed = Record<string, unknown>;

export interface AxisCapabilities {
  can: boolean;
  can_abs: boolean;
  can_rel: boolean;
  can_con: boolean;
  can_auto: boolean;
  range: AxisRange;
  speed: AxisSpeed;
  step: AxisStep;
}

export interface PanTiltCapabilities {
  can_move: boolean;
  can_pan: boolean;
  can_tilt: boolean;
  can_move_diag: boolean;
  can_move_abs: boolean;
  can_move_con: boolean;
  can_move_rel: boolean;
  can_move_map: boolean;
  pan_range: AxisRange;
  pan_speed: AxisSpeed;
  pan_step: AxisStep;
  pan_turbo: TurboSpeed;
  tilt_range: AxisRange;
  tilt_speed: AxisSpeed;
  tilt_step: AxisStep;
  tilt_turbo: TurboSpeed;
}

export interface PresetCapabilities {
  has_presets: boolean;
  num_presets: number;
  can_set_presets: boolean;
  has_home_preset: boolean;
}

export interface PowerCapabilities {
  can_wake: boolean;
  can_sleep: boolean;
  can_reset: boolean;
  can_reboot: boolean;
}

export interface ScanCapabilities {
  can_auto_scan: boolean;
  num_scan_paths: number;
}

export interface PtzCapabilities {
  control_id: number;
  name: string;
  protocol: string | null;
  pan_tilt: PanTiltCapabilities;
  zoom: AxisCapabilities;
  focus: AxisCapabilities;
  iris: AxisCapabilities;
  gain: AxisCapabilities;
  white_balance: AxisCapabilities;
  presets: PresetCapabilities;
  power: PowerCapabilities;
  scan: ScanCapabilities;
}

export interface PtzPositionResponse {
  pan: number | null;
  tilt: number | null;
  zoom: number | null;
}

export interface PtzStatusResponse {
  available: boolean;
  capabilities: PtzCapabilities;
  is_native: boolean;
  monitor_id: number;
  position: PtzPositionResponse;
  protocol: string | null;
}

export interface PtzCommandResponse {
  success: boolean;
  message: string;
}

// --- Request bodies ---

export interface PtzMoveRequest {
  pan_speed?: number | null;
  tilt_speed?: number | null;
  duration_ms?: number | null;
}
export interface PtzZoomRequest {
  speed?: number | null;
  duration_ms?: number | null;
}
export interface PtzFocusRequest {
  speed?: number | null;
  duration_ms?: number | null;
}
export interface PtzRelativeRequest {
  pan_delta?: number | null;
  tilt_delta?: number | null;
  zoom_delta?: number | null;
}
export interface PtzAbsoluteRequest {
  pan?: number | null;
  tilt?: number | null;
  zoom?: number | null;
}
export interface PtzPresetRequest {
  name?: string | null;
}

// 8 compass directions accepted by /ptz/monitors/{id}/move/{dir}
export type PtzDirection =
  | 'up' | 'down' | 'left' | 'right'
  | 'up-left' | 'up-right' | 'down-left' | 'down-right';

// --- Endpoint wrappers ---

const base = (id: number) => `/ptz/monitors/${id}`;

export const ptz = {
  getProtocols: () =>
    apiGet<{
      protocols: Array<{ name: string; is_native: boolean; description: string | null }>;
      native_protocols: string[];
      perl_fallback_enabled: boolean;
    }>('/ptz/protocols'),

  getCapabilities: (monitorId: number) =>
    apiGet<PtzCapabilities>(`${base(monitorId)}/capabilities`),

  getStatus: (monitorId: number) =>
    apiGet<PtzStatusResponse>(`${base(monitorId)}/status`),

  move: (monitorId: number, direction: PtzDirection, body: PtzMoveRequest = {}) =>
    apiPost<PtzMoveRequest, PtzCommandResponse>(`${base(monitorId)}/move/${direction}`, body),

  stopMove: (monitorId: number) =>
    apiPost<Record<string, never>, PtzCommandResponse>(`${base(monitorId)}/move/stop`, {}),

  zoom: (monitorId: number, direction: 'in' | 'out', body: PtzZoomRequest = {}) =>
    apiPost<PtzZoomRequest, PtzCommandResponse>(`${base(monitorId)}/zoom/${direction}`, body),

  stopZoom: (monitorId: number) =>
    apiPost<Record<string, never>, PtzCommandResponse>(`${base(monitorId)}/zoom/stop`, {}),

  focus: (monitorId: number, direction: 'near' | 'far' | 'auto', body: PtzFocusRequest = {}) =>
    apiPost<PtzFocusRequest, PtzCommandResponse>(`${base(monitorId)}/focus/${direction}`, body),

  stopFocus: (monitorId: number) =>
    apiPost<Record<string, never>, PtzCommandResponse>(`${base(monitorId)}/focus/stop`, {}),

  home: (monitorId: number) =>
    apiPost<Record<string, never>, PtzCommandResponse>(`${base(monitorId)}/home`, {}),

  gotoPreset: (monitorId: number, presetId: number) =>
    apiPost<Record<string, never>, PtzCommandResponse>(
      `${base(monitorId)}/presets/${presetId}/goto`,
      {},
    ),

  setPreset: (monitorId: number, presetId: number, name?: string) =>
    apiPost<PtzPresetRequest, PtzCommandResponse>(
      `${base(monitorId)}/presets/${presetId}/set`,
      { name: name ?? null },
    ),

  clearPreset: (monitorId: number, presetId: number) =>
    apiDelete(`${base(monitorId)}/presets/${presetId}`),

  moveRelative: (monitorId: number, body: PtzRelativeRequest) =>
    apiPost<PtzRelativeRequest, PtzCommandResponse>(`${base(monitorId)}/relative`, body),

  moveAbsolute: (monitorId: number, body: PtzAbsoluteRequest) =>
    apiPost<PtzAbsoluteRequest, PtzCommandResponse>(`${base(monitorId)}/absolute`, body),
};
