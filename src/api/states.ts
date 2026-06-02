import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { PaginatedResponse } from '@/types';

/**
 * A named ZoneMinder run-state. The `definition` column encodes the
 * per-monitor capturing/analysing/recording mode as a comma-separated list
 * of `MonitorId:Capturing:Analysing:Recording` triples (the legacy
 * `web/includes/actions/state.php` save format).
 */
export interface State {
  id: number;
  name: string;
  definition: string;
  /** 0 / 1 — the row matching the currently-applied state. */
  is_active: number;
}

export interface CreateStatePayload {
  name: string;
  definition: string;
  is_active: number;
}

export interface UpdateStatePayload {
  name?: string;
  definition?: string;
  is_active?: number;
}

export type DaemonAction = 'start' | 'stop' | 'restart';

export interface DaemonActionResponse {
  success: boolean;
  message: string;
}

export interface MessageResponse {
  message: string;
}

export async function listStates(
  params?: { page?: number; page_size?: number },
): Promise<PaginatedResponse<State>> {
  return apiGet<PaginatedResponse<State>>(
    '/states',
    params as Record<string, string | number | undefined>,
  );
}

export async function getState(id: number): Promise<State> {
  return apiGet<State>(`/states/${id}`);
}

export async function createState(payload: CreateStatePayload): Promise<State> {
  return apiPost<CreateStatePayload, State>('/states', payload);
}

export async function updateState(id: number, payload: UpdateStatePayload): Promise<State> {
  return apiPatch<UpdateStatePayload, State>(`/states/${id}`, payload);
}

export async function deleteState(id: number): Promise<void> {
  return apiDelete(`/states/${id}`);
}

/**
 * Apply a saved named state — backend reads `States.Definition` for that name
 * and writes Monitors.Capturing/Analysing/Recording across the fleet, then
 * restarts affected daemons.
 */
export async function applyState(stateName: string): Promise<DaemonActionResponse> {
  return apiPost<{ state_name: string }, DaemonActionResponse>('/system/state', {
    state_name: stateName,
  });
}

/**
 * Toggle the ZoneMinder daemon supervisor (`zmpkg.pl`) without changing
 * per-monitor configuration. Use for plain start / stop / restart.
 */
export async function changeDaemonState(action: DaemonAction): Promise<MessageResponse> {
  return apiPost<undefined, MessageResponse>(`/states/change/${action}`);
}

/**
 * Compose a Definition string from a list of monitors using the legacy
 * `Id:Capturing:Analysing:Recording` triple format (verified against
 * `web/includes/actions/state.php` line 36).
 */
export function composeDefinition(
  monitors: ReadonlyArray<{
    id: number;
    capturing: string;
    analysing: string;
    recording: string;
  }>,
): string {
  return [...monitors]
    .sort((a, b) => a.id - b.id)
    .map((m) => `${m.id}:${m.capturing}:${m.analysing}:${m.recording}`)
    .join(',');
}

/** Parse a Definition string back into structured triples. Lenient — skips malformed entries. */
export function parseDefinition(definition: string): Array<{
  id: number;
  capturing: string;
  analysing: string;
  recording: string;
}> {
  if (!definition.trim()) return [];
  return definition
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [idStr, capturing, analysing, recording] = part.split(':');
      const id = Number(idStr);
      if (!Number.isFinite(id) || !capturing || !analysing || !recording) return null;
      return { id, capturing, analysing, recording };
    })
    .filter((x): x is { id: number; capturing: string; analysing: string; recording: string } => x !== null);
}
