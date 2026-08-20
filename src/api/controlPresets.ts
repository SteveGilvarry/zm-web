import { apiGet } from './client';
import type { PaginatedResponse } from '@/types';

/**
 * A saved PTZ preset (`ControlPresets` row). `preset` is the slot number the
 * camera knows; `label` is the operator's name for it. The monitor editor's
 * Return Location select lists these after the None / Home sentinels.
 */
export interface ControlPreset {
  monitor_id: number;
  preset: number;
  label: string;
}

export async function listControlPresets(
  params?: { monitor_id?: number; page?: number; page_size?: number },
): Promise<PaginatedResponse<ControlPreset>> {
  return apiGet<PaginatedResponse<ControlPreset>>(
    '/control_presets',
    params as Record<string, string | number | undefined>,
  );
}
