import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { PaginatedResponse } from '@/types';

export interface Group {
  id: number;
  name: string;
  parent_id?: number | null;
}

export interface GroupMonitor {
  id: number;
  group_id: number;
  monitor_id: number;
}

export async function listGroups(
  params?: { page?: number; page_size?: number },
): Promise<PaginatedResponse<Group>> {
  return apiGet<PaginatedResponse<Group>>(
    '/groups',
    params as Record<string, string | number | undefined>,
  );
}

export async function getGroup(id: number): Promise<Group> {
  return apiGet<Group>(`/groups/${id}`);
}

export async function createGroup(name: string, parentId?: number | null): Promise<Group> {
  return apiPost<{ name: string; parent_id?: number | null }, Group>('/groups', {
    name,
    parent_id: parentId ?? null,
  });
}

/**
 * Rename and/or re-parent a group. `parent_id` persists (zm-api#28);
 * omitting it leaves the parent alone, `null` moves the group to the top
 * level. The backend rejects self-parenting and cycles.
 */
export async function updateGroup(
  id: number,
  name: string,
  parentId?: number | null,
): Promise<Group> {
  const body: { name: string; parent_id?: number | null } = { name };
  if (parentId !== undefined) body.parent_id = parentId;
  return apiPut<typeof body, Group>(`/groups/${id}`, body);
}

export async function deleteGroup(id: number): Promise<void> {
  return apiDelete(`/groups/${id}`);
}

/* ----- Group ↔ Monitor associations ------------------------------------- */

export async function listGroupMonitors(
  params?: { page?: number; page_size?: number },
): Promise<PaginatedResponse<GroupMonitor>> {
  return apiGet<PaginatedResponse<GroupMonitor>>(
    '/groups-monitors',
    params as Record<string, string | number | undefined>,
  );
}

export async function attachMonitorToGroup(
  groupId: number,
  monitorId: number,
): Promise<GroupMonitor> {
  return apiPost<{ group_id: number; monitor_id: number }, GroupMonitor>(
    '/groups-monitors',
    { group_id: groupId, monitor_id: monitorId },
  );
}

export async function detachMonitorFromGroup(groupMonitorId: number): Promise<void> {
  return apiDelete(`/groups-monitors/${groupMonitorId}`);
}
