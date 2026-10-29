import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { PaginatedResponse } from '@/types';
import type { UserPermissionsInput } from './users';

/**
 * Roles (ZoneMinder 1.39, zm-api#143): a named permission set a user holds
 * through `role_id`. Legacy's Options → Roles tab (`_options_roles.php`) and
 * the role editor (`role.php`). A role grants only what it names; a user's
 * own levels still apply on top.
 */
export interface Role {
  id: number;
  name: string;
  description?: string | null;
  system: string;
  stream: string;
  events: string;
  control: string;
  monitors: string;
  groups: string;
  devices: string;
  snapshots: string;
}

export interface RoleInput extends UserPermissionsInput {
  name: string;
  description?: string | null;
}

export async function listRoles(params?: { page?: number; page_size?: number }): Promise<PaginatedResponse<Role>> {
  return apiGet<PaginatedResponse<Role>>('/roles', params);
}

export async function getRole(id: number): Promise<Role> {
  return apiGet<Role>(`/roles/${id}`);
}

/** Omitted permission levels default to `None`. */
export async function createRole(input: RoleInput): Promise<Role> {
  return apiPost<RoleInput, Role>('/roles', input);
}

export async function updateRole(id: number, input: Partial<RoleInput>): Promise<Role> {
  return apiPut<Partial<RoleInput>, Role>(`/roles/${id}`, input);
}

/** Its users keep their own permission levels. */
export async function deleteRole(id: number): Promise<void> {
  return apiDelete(`/roles/${id}`);
}
