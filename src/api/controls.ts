import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { PaginatedResponse } from '@/types';

/**
 * A `Control` is a PTZ-protocol definition — the catalogue of camera
 * control drivers ZoneMinder knows how to drive. It mirrors the legacy
 * `Controls` table and the very wide /controls editor: ~50 boolean
 * capability flags + range/speed/step sub-objects per axis.
 *
 * Monitors reference a Control via `monitor.control_id`.
 */
export interface Control {
  id: number;
  name: string;
  type: string;
  protocol?: string | null;

  // Movement capabilities
  can_pan: number;
  can_tilt: number;
  can_zoom: number;
  can_move: number;
  can_move_abs: number;
  can_move_rel: number;
  can_move_con: number;
  can_move_diag: number;
  can_move_map: number;

  // Zoom / focus / iris / gain / white capabilities (the long tail)
  can_auto_zoom: number;
  can_zoom_abs: number;
  can_zoom_rel: number;
  can_zoom_con: number;
  has_zoom_speed: number;
  can_focus: number;
  can_auto_focus: number;
  can_focus_abs: number;
  can_focus_rel: number;
  can_focus_con: number;
  has_focus_speed: number;
  can_iris: number;
  can_auto_iris: number;
  can_iris_abs: number;
  can_iris_rel: number;
  can_iris_con: number;
  has_iris_speed: number;
  can_gain: number;
  can_auto_gain: number;
  can_gain_abs: number;
  can_gain_rel: number;
  can_gain_con: number;
  has_gain_speed: number;
  can_white: number;
  can_auto_white: number;
  can_white_abs: number;
  can_white_rel: number;
  can_white_con: number;
  has_white_speed: number;

  // Presets
  has_presets: number;
  num_presets: number;
  has_home_preset: number;
  can_set_presets: number;

  // Pan / tilt sub-flags
  has_pan_speed: number;
  has_turbo_pan: number;
  has_tilt_speed: number;
  has_turbo_tilt: number;

  // Power / scan
  can_wake: number;
  can_sleep: number;
  can_reset: number;
  can_reboot: number;
  can_auto_scan: number;
  num_scan_paths: number;
}

export type CreateControlPayload = Omit<Control, 'id'>;
export type UpdateControlPayload = Partial<CreateControlPayload>;

export async function listControls(params?: {
  page?: number; page_size?: number;
}): Promise<PaginatedResponse<Control>> {
  return apiGet<PaginatedResponse<Control>>(
    '/controls',
    (params ?? { page: 1, page_size: 200 }) as Record<string, string | number | undefined>,
  );
}

export async function getControl(id: number): Promise<Control> {
  return apiGet<Control>(`/controls/${id}`);
}

export async function createControl(payload: CreateControlPayload): Promise<Control> {
  return apiPost<CreateControlPayload, Control>('/controls', payload);
}

export async function updateControl(
  id: number,
  payload: UpdateControlPayload,
): Promise<Control> {
  return apiPatch<UpdateControlPayload, Control>(`/controls/${id}`, payload);
}

export async function deleteControl(id: number): Promise<void> {
  return apiDelete(`/controls/${id}`);
}

/** Compact capability summary for the list view. */
export function summarizeCapabilities(c: Control): string {
  const tags: string[] = [];
  if (c.can_pan && c.can_tilt) tags.push('Pan/Tilt');
  else if (c.can_pan) tags.push('Pan');
  else if (c.can_tilt) tags.push('Tilt');
  if (c.can_zoom) tags.push('Zoom');
  if (c.can_focus) tags.push('Focus');
  if (c.has_presets) tags.push(`Presets (${c.num_presets})`);
  return tags.length ? tags.join(' · ') : 'View only';
}
