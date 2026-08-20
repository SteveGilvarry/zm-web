import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { ZmStorage, PaginatedResponse } from '@/types';

export async function getStorageList(params?: {
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<ZmStorage>> {
  return apiGet<PaginatedResponse<ZmStorage>>('/storage', params);
}

export async function createStorage(data: {
  name: string;
  path: string;
  type: string;
  enabled: number;
}): Promise<ZmStorage> {
  return apiPost<typeof data, ZmStorage>('/storage', data);
}

export async function updateStorage(
  id: number,
  data: Partial<{ name: string; path: string; type: string; enabled: number }>
): Promise<ZmStorage> {
  // The route is PATCH-only; PUT answers 405.
  return apiPatch<typeof data, ZmStorage>(`/storage/${id}`, data);
}

export async function deleteStorage(id: number): Promise<void> {
  return apiDelete(`/storage/${id}`);
}
