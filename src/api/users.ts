import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { User, PaginatedResponse } from '@/types';

export async function getUsers(params?: {
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<User>> {
  return apiGet<PaginatedResponse<User>>('/users', params);
}

export async function getUser(id: number): Promise<User> {
  return apiGet<User>(`/users/${id}`);
}

/** The eight per-feature levels (`UserPermissionsInput`): `None` / `View` / `Edit`, plus `Create` for monitors. */
export interface UserPermissionsInput {
  system?: string;
  stream?: string;
  events?: string;
  control?: string;
  monitors?: string;
  groups?: string;
  devices?: string;
  snapshots?: string;
}

/** Account fields shared by create and update (`CreateUserRequest` / `UpdateUserRequest`). */
export interface UserAccountInput {
  name?: string;
  email?: string;
  enabled?: number;
  phone?: string;
  /** ZoneMinder language file name (`en_gb`); '' or null clears it. */
  language?: string | null;
  home_view?: string;
  api_enabled?: number;
  max_bandwidth?: string | null;
}

/** Create a user. Omitted permission levels default to `View` on the backend. */
export async function createUser(
  data: UserAccountInput & UserPermissionsInput & { username: string; password: string; email: string },
): Promise<User> {
  return apiPost<typeof data, User>('/users', data);
}

/**
 * Partial update: only the fields sent change. `password` is re-hashed by
 * the backend; `token_min_expiry` set to "now" revokes the user's tokens.
 */
export async function updateUser(
  id: number,
  data: UserAccountInput & UserPermissionsInput & { password?: string; token_min_expiry?: number },
): Promise<User> {
  return apiPut<typeof data, User>(`/users/${id}`, data);
}

export async function deleteUser(id: number): Promise<void> {
  return apiDelete(`/users/${id}`);
}
