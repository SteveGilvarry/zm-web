import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { PaginatedResponse } from '@/types';

export interface Server {
  id: number;
  name: string;
  hostname?: string | null;
  port?: number | null;
  status: string;

  /* Full row since zm-api#25, and writable since the same work landed on
   * Create/UpdateServerRequest — see `CreateServerPayload` below. */
  protocol?: string | null;
  path_to_index?: string | null;
  path_to_zms?: string | null;
  path_to_api?: string | null;
  /** Per-daemon enable flags (0/1). */
  zmaudit?: number;
  zmstats?: number;
  zmtrigger?: number;
  zmeventnotification?: number;
  /** Run state the cluster controller put this server in; not writable. */
  state_id?: number | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  /** Monitors whose `ServerId` points here, counted by the backend. */
  monitor_count?: number;
}

export async function listServers(
  params?: { page?: number; page_size?: number },
): Promise<PaginatedResponse<Server>> {
  return apiGet<PaginatedResponse<Server>>(
    '/servers',
    params as Record<string, string | number | undefined>,
  );
}

/**
 * Everything Create/UpdateServerRequest accept — the legacy Servers modal's
 * field set (`web/ajax/modals/server.php`) plus `status` and the coordinates.
 *
 * The four daemon flags go out as JSON booleans (that is what the request
 * schema declares) and come back as 0/1 ints on `ServerResponse`.
 */
export interface CreateServerPayload {
  name: string;
  /** `http` or `https`, as legacy's Protocol field offers. */
  protocol?: string | null;
  hostname?: string | null;
  port?: number | null;
  path_to_index?: string | null;
  path_to_zms?: string | null;
  path_to_api?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Run this daemon on this server (legacy RunStats / RunAudit / …). */
  zmstats?: boolean | null;
  zmaudit?: boolean | null;
  zmtrigger?: boolean | null;
  zmeventnotification?: boolean | null;
  status?: string | null;
}

export async function createServer(payload: CreateServerPayload): Promise<Server> {
  return apiPost<CreateServerPayload, Server>('/servers', payload);
}

export async function updateServer(id: number, payload: Partial<CreateServerPayload>): Promise<Server> {
  return apiPatch<Partial<CreateServerPayload>, Server>(`/servers/${id}`, payload);
}

export async function deleteServer(id: number): Promise<void> {
  return apiDelete(`/servers/${id}`);
}
