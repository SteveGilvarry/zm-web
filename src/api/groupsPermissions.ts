import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { PaginatedResponse } from '@/types';

/**
 * Group permission row from `/api/v3/groups-permissions`.
 *
 * Represents a per-user override on a single group. The `permission` field
 * is a string enum: `'Inherit' | 'None' | 'View' | 'Edit'`. When no row
 * exists for a given (user, group) pair, the effective state is `Inherit`.
 */
export interface GroupPermission {
  id: number;
  group_id: number;
  user_id: number;
  permission: string;
}

export async function listGroupsPermissions(params?: {
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<GroupPermission>> {
  return apiGet<PaginatedResponse<GroupPermission>>(
    '/groups-permissions',
    params as Record<string, string | number | undefined>,
  );
}

export async function getGroupPermission(id: number): Promise<GroupPermission> {
  return apiGet<GroupPermission>(`/groups-permissions/${id}`);
}

export async function createGroupPermission(data: {
  group_id: number;
  user_id: number;
  permission: string;
}): Promise<GroupPermission> {
  return apiPost<typeof data, GroupPermission>('/groups-permissions', data);
}

export async function updateGroupPermission(
  id: number,
  permission: string,
): Promise<GroupPermission> {
  return apiPatch<{ permission: string }, GroupPermission>(
    `/groups-permissions/${id}`,
    { permission },
  );
}

export async function deleteGroupPermission(id: number): Promise<void> {
  return apiDelete(`/groups-permissions/${id}`);
}
