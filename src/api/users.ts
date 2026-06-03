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

/**
 * Create a user. Per the backend OpenAPI spec, `CreateUserRequest` carries
 * ONLY login fields (`username`, `password`, `email`, `name`, `enabled`,
 * `phone`). The 8 top-level permission columns (stream/events/...) are not
 * accepted on create — new users are seeded with backend defaults and
 * permissions must subsequently be edited via the dedicated grids
 * (`/groups-permissions`, `/monitors-permissions`).
 *
 * Optional `system` and the other permission fields are still accepted
 * here as a forward-compatible escape hatch — they're silently dropped
 * by the current backend but will start sticking once the backend gains
 * the matching DTO fields (tracked: backend ticket).
 */
export async function createUser(data: {
  username: string;
  password: string;
  name: string;
  email: string;
  enabled: number;
  phone?: string;
  system?: string;
  stream?: string;
  events?: string;
  control?: string;
  monitors?: string;
  groups?: string;
  devices?: string;
  snapshots?: string;
}): Promise<User> {
  return apiPost<typeof data, User>('/users', data);
}

/**
 * Update a user. Per the backend OpenAPI spec, `UpdateUserRequest`
 * accepts ONLY `email` + `enabled` today. We pass through any other
 * fields the caller provides — the backend currently drops them, but
 * this leaves room for the expansion ticket without churning callers.
 */
export async function updateUser(
  id: number,
  data: Partial<{
    password: string;
    name: string;
    email: string;
    enabled: number;
    phone: string;
    system: string;
    stream: string;
    events: string;
    control: string;
    monitors: string;
    groups: string;
    devices: string;
    snapshots: string;
  }>
): Promise<User> {
  return apiPut<typeof data, User>(`/users/${id}`, data);
}

export async function deleteUser(id: number): Promise<void> {
  return apiDelete(`/users/${id}`);
}
