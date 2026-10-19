import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { PtzCommandResponse } from './ptz';

/**
 * Monitor actions (`MonitorActions`, ZoneMinder 1.39.30, zm-api#179): rows on
 * a monitor that drive another device's light or speaker when an event or
 * alarm starts or ends, or by hand. Legacy's monitor editor has an Actions
 * tab for them and the watch page runs the `Manual` ones.
 */
export type MonitorActionType =
  | 'LightOn' | 'LightOff' | 'IndicatorLightOn' | 'IndicatorLightOff' | 'AudioPlay' | 'AudioStop';
export type MonitorActionTrigger = 'EventStart' | 'EventEnd' | 'Alarm' | 'AlarmEnd' | 'Manual';

export interface MonitorAction {
  id: number;
  monitor_id: number;
  /** The monitor whose device is driven; often not this one. */
  target_monitor_id: number;
  action_type?: MonitorActionType | null;
  trigger_on?: MonitorActionTrigger | null;
  /** The sound to play, for `AudioPlay`. */
  audio_file?: number | null;
  label: string;
  enabled: boolean;
  sequence: number;
}

export interface MonitorActionInput {
  target_monitor_id: number;
  action_type: MonitorActionType;
  trigger_on?: MonitorActionTrigger | null;
  audio_file?: number | null;
  label?: string | null;
  /** Defaults to true. */
  enabled?: boolean | null;
  sequence?: number | null;
}

/** A monitor an action can drive, with what its control can do. */
export interface MonitorActionTarget {
  id: number;
  name: string;
  /** `Camera` or `Speaker`. */
  device_class: string;
  types: MonitorActionType[];
  min_audio_file?: number | null;
  max_audio_file?: number | null;
}

export async function listMonitorActions(monitorId: number): Promise<MonitorAction[]> {
  return apiGet<MonitorAction[]>(`/monitors/${monitorId}/actions`);
}

export async function listMonitorActionTargets(monitorId: number): Promise<MonitorActionTarget[]> {
  return apiGet<MonitorActionTarget[]>(`/monitors/${monitorId}/actions/targets`);
}

export async function getMonitorAction(monitorId: number, actionId: number): Promise<MonitorAction> {
  return apiGet<MonitorAction>(`/monitors/${monitorId}/actions/${actionId}`);
}

export async function createMonitorAction(monitorId: number, input: MonitorActionInput): Promise<MonitorAction> {
  return apiPost<MonitorActionInput, MonitorAction>(`/monitors/${monitorId}/actions`, input);
}

/** `audio_file: null` clears it; an omitted field is left alone. */
export async function updateMonitorAction(
  monitorId: number, actionId: number, input: Partial<MonitorActionInput>,
): Promise<MonitorAction> {
  return apiPatch<Partial<MonitorActionInput>, MonitorAction>(`/monitors/${monitorId}/actions/${actionId}`, input);
}

export async function deleteMonitorAction(monitorId: number, actionId: number): Promise<void> {
  return apiDelete(`/monitors/${monitorId}/actions/${actionId}`);
}

/** Run a `Manual` action now. */
export async function runMonitorAction(monitorId: number, actionId: number): Promise<PtzCommandResponse> {
  return apiPost<Record<string, never>, PtzCommandResponse>(`/monitors/${monitorId}/actions/${actionId}/run`, {});
}
