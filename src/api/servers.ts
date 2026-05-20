import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { PaginatedResponse } from '@/types';

export interface Server {
  id: number;
  name: string;
  hostname?: string | null;
  port?: number | null;
  status: string;
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
