import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { PaginatedResponse } from '@/types';

/**
 * Monitor permission row from `/api/v3/monitors-permissions`.
 *
 * Represents a per-user override on a single monitor. The `permission`
 * field is a string enum: `'Inherit' | 'None' | 'View' | 'Edit'`. When no
 * row exists for a given (user, monitor) pair, the effective state is
 * `Inherit`.
 */
export interface MonitorPermission {
  id: number;
  monitor_id: number;
  user_id: number;
  permission: string;
}

export async function listMonitorsPermissions(params?: {
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<MonitorPermission>> {
  return apiGet<PaginatedResponse<MonitorPermission>>(
    '/monitors-permissions',
    params as Record<string, string | number | undefined>,
  );
}

export async function getMonitorPermission(id: number): Promise<MonitorPermission> {
  return apiGet<MonitorPermission>(`/monitors-permissions/${id}`);
}

export async function createMonitorPermission(data: {
  monitor_id: number;
  user_id: number;
  permission: string;
}): Promise<MonitorPermission> {
  return apiPost<typeof data, MonitorPermission>('/monitors-permissions', data);
}

export async function updateMonitorPermission(
  id: number,
  permission: string,
): Promise<MonitorPermission> {
  return apiPatch<{ permission: string }, MonitorPermission>(
    `/monitors-permissions/${id}`,
    { permission },
  );
}

export async function deleteMonitorPermission(id: number): Promise<void> {
  return apiDelete(`/monitors-permissions/${id}`);
}
