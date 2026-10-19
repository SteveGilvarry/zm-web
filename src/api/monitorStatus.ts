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
  /**
   * Live alarm state from shared memory, `idle | prealarm | alarm | alert`
   * (what `zmu -s` reports). Only on `GET /monitor-status/{id}` and only
   * while zmc runs; absent otherwise (zm-api#139).
   */
  alarm_state?: string | null;
  /** Alarms forced off (`zmu -n`); same availability. */
  alarms_disabled?: boolean | null;
  /** Analysing right now; same availability. */
  analysing?: boolean | null;
}

export async function getMonitorStatuses(
  params?: { page?: number; page_size?: number },
): Promise<PaginatedResponse<MonitorStatusRecord>> {
  return apiGet<PaginatedResponse<MonitorStatusRecord>>(
    '/monitor-status',
    params as Record<string, string | number | undefined>,
  );
}

/** `AudioLevelResponse`: the live level on `AudioThreshold`'s 0-100 scale (zm-api#180). */
export interface AudioLevel {
  /** null while zmc isn't running. */
  level?: number | null;
  /** Over the threshold; null while zmc isn't running. */
  alarm?: boolean | null;
  threshold: number;
  /** Whether audio detection scores (`AudioDetection`). */
  detection: boolean;
}

export async function getAudioLevel(monitorId: number): Promise<AudioLevel> {
  return apiGet<AudioLevel>(`/monitors/${monitorId}/audio-level`);
}

export async function getMonitorStatus(monitorId: number): Promise<MonitorStatusRecord> {
  return apiGet<MonitorStatusRecord>(`/monitor-status/${monitorId}`);
}
