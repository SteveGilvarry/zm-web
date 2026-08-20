import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { ZmStorage, PaginatedResponse } from '@/types';

/** ZoneMinder `Storage.Scheme` — how event directories are laid out. */
export const STORAGE_SCHEMES = ['Deep', 'Medium', 'Shallow'] as const;
export type StorageScheme = (typeof STORAGE_SCHEMES)[number];

export interface StorageWritePayload {
  name: string;
  path: string;
  type: string;
  enabled: number;
  /**
   * `scheme`, `server_id` and `url` are accepted by Create/UpdateStorageRequest
   * but `StorageResponse` does not echo them yet, so the list cannot show
   * what is stored. Send them; do not expect them back.
   */
  scheme?: string | null;
  server_id?: number | null;
  url?: string | null;
}

export async function getStorageList(params?: {
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<ZmStorage>> {
  return apiGet<PaginatedResponse<ZmStorage>>('/storage', params);
}

export async function createStorage(data: StorageWritePayload): Promise<ZmStorage> {
  return apiPost<StorageWritePayload, ZmStorage>('/storage', data);
}

export async function updateStorage(
  id: number,
  data: Partial<StorageWritePayload>,
): Promise<ZmStorage> {
  // The route is PATCH-only; PUT answers 405.
  return apiPatch<Partial<StorageWritePayload>, ZmStorage>(`/storage/${id}`, data);
}

export async function deleteStorage(id: number): Promise<void> {
  return apiDelete(`/storage/${id}`);
}
