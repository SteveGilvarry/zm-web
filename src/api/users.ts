import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { User, PaginatedResponse } from '@/types';

export async function getUsers(params?: {
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<User>> {
  return apiGet<PaginatedResponse<User>>('/users', params);
}

export async function createUser(data: {
  username: string;
  password: string;
  name: string;
  email: string;
  enabled: number;
  system: string;
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

export async function updateUser(
  id: number,
  data: Partial<{
    password: string;
    name: string;
    email: string;
    enabled: number;
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
