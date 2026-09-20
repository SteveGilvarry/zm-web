import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { ZmStorage, PaginatedResponse } from '@/types';

/** ZoneMinder `Storage.Scheme` — how event directories are laid out. */
export const STORAGE_SCHEMES = ['Deep', 'Medium', 'Shallow'] as const;
export type StorageScheme = (typeof STORAGE_SCHEMES)[number];

/**
 * Body for `POST /storage` and (partially) `PATCH /storage/{id}`.
 *
 * Mirrors Create/UpdateStorageRequest. `disk_space` is read back from
 * `StorageResponse` but is never writable — zmaudit owns it.
 *
 * Needs a zm-api with the full `StorageResponse` row (zm-api#24): older builds
 * drop `scheme` / `server_id` / `url` from the response, so the list columns
 * and the edit form would come back blank after a save. No runtime fallback.
 */
export interface StorageWritePayload {
  name: string;
  path: string;
  type: string;
  enabled: number;
  /** Directory layout for events: `Deep` | `Medium` | `Shallow`. */
  scheme?: string | null;
  /** Owning cluster server; null (or 0) means every server can reach the path. */
  server_id?: number | null;
  /** s3fs / remote URL; null for a plain local path. */
  url?: string | null;
}

/**
 * `CreateStorageRequest` carries `do_delete`; `UpdateStorageRequest` does not,
 * and the backend silently drops it from a PATCH (verified on the dev box:
 * `PATCH /storage/{id} {do_delete: 1}` answers 200 with `do_delete` unchanged).
 * So it is a create-time choice only, and the type says so rather than letting
 * a caller send an update that looks like it worked.
 */
export interface StorageCreatePayload extends StorageWritePayload {
  /** 1 = deleting an event may reclaim its media here; 0 = never. */
  do_delete?: number | null;
}

export async function getStorageList(params?: {
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<ZmStorage>> {
  return apiGet<PaginatedResponse<ZmStorage>>('/storage', params);
}

export async function createStorage(data: StorageCreatePayload): Promise<ZmStorage> {
  return apiPost<StorageCreatePayload, ZmStorage>('/storage', data);
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
