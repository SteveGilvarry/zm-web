import { apiGet } from './client';
import type { PaginatedResponse } from '@/types';

/**
 * Runtime state of a monitor's capture process (`zm_Monitor_Status`), as
 * served by `GET /api/v3/monitor-status`. Distinct from the configuration
 * row: `capturing: 'Always'` says what the operator asked for, `status`
 * says what zmc is doing right now.
 *
 * `status` is ZoneMinder's enum: `Unknown | NotRunning | Running | Connected
 * | Signal`. The fps fields arrive as decimal strings.
 */
export interface MonitorStatusRecord {
  monitor_id: number;
  status: string;
  capture_fps: string;
  analysis_fps: string;
  capture_bandwidth: number;
  updated_on: string;
}

export async function getMonitorStatuses(
  params?: { page?: number; page_size?: number },
): Promise<PaginatedResponse<MonitorStatusRecord>> {
  return apiGet<PaginatedResponse<MonitorStatusRecord>>(
    '/monitor-status',
    params as Record<string, string | number | undefined>,
  );
}

export async function getMonitorStatus(monitorId: number): Promise<MonitorStatusRecord> {
  return apiGet<MonitorStatusRecord>(`/monitor-status/${monitorId}`);
}
