import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { PaginatedResponse } from '@/types';

export interface Server {
  id: number;
  name: string;
  hostname?: string | null;
  port?: number | null;
  status: string;

  /* Full row since zm-api#25. `UpdateServerRequest` still accepts only
   * name/hostname/port/status, so the rest are read-only for now. */
  protocol?: string | null;
  path_to_index?: string | null;
  path_to_zms?: string | null;
  path_to_api?: string | null;
  /** Per-daemon enable flags (0/1). */
  zmaudit?: number;
  zmstats?: number;
  zmtrigger?: number;
  zmeventnotification?: number;
  state_id?: number | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
}

export async function listServers(
  params?: { page?: number; page_size?: number },
): Promise<PaginatedResponse<Server>> {
  return apiGet<PaginatedResponse<Server>>(
    '/servers',
    params as Record<string, string | number | undefined>,
  );
}

export interface CreateServerPayload {
  name: string;
  hostname?: string | null;
  port?: number | null;
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
