import { apiGet } from './client';
import type { PaginatedResponse } from '@/types';

/**
 * A row of ZoneMinder's `MonitorPresets` table — the legacy "Presets" picker
 * on the new-monitor form. Note the underscore path (`/monitor_presets`);
 * `/monitor-presets` does not exist.
 */
export interface MonitorPreset {
  id: number;
  name: string;
  type: string;
  model_id?: number | null;
  device?: string | null;
  channel?: number | null;
  format?: number | null;
  protocol?: string | null;
  method?: string | null;
  host?: string | null;
  port?: string | null;
  path?: string | null;
  sub_path?: string | null;
  width?: number | null;
  height?: number | null;
  palette?: number | null;
  max_fps?: number | null;
  controllable: number;
  /** A control-profile id, but stored as text in the presets table. */
  control_id?: string | null;
  control_device?: string | null;
  control_address?: string | null;
  default_rate: number;
  default_scale: string;
}

export async function listMonitorPresets(
  params?: { page?: number; page_size?: number },
): Promise<PaginatedResponse<MonitorPreset>> {
  return apiGet<PaginatedResponse<MonitorPreset>>(
    '/monitor_presets',
    params as Record<string, string | number | undefined>,
  );
}
