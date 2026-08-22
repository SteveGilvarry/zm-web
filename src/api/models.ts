import { apiGet, apiPost } from './client';
import type { PaginatedResponse } from '@/types';

/** A row of ZoneMinder's `Models` table; `manufacturer_id` scopes the legacy Model picker. */
export interface CameraModel {
  id: number;
  name: string;
  manufacturer_id?: number | null;
}

export async function listModels(
  params?: { manufacturer_id?: number; page?: number; page_size?: number },
): Promise<PaginatedResponse<CameraModel>> {
  return apiGet<PaginatedResponse<CameraModel>>(
    '/models',
    params as Record<string, string | number | undefined>,
  );
}

export async function createModel(
  input: { name: string; manufacturer_id?: number | null },
): Promise<CameraModel> {
  return apiPost<typeof input, CameraModel>('/models', input);
}
