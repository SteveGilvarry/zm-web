import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { PaginatedResponse } from '@/types';

/**
 * Persisted named montage layouts. The `positions` field is a string
 * column on the backend — we stuff our LayoutNode tree into it as JSON
 * and parse on the way out. ZoneMinder's original use of this column
 * was a packed position list; our format is opaque to the backend.
 */
export interface MontageLayout {
  id: number;
  name: string;
  positions: string | null;
  user_id: number;
}

export async function listMontageLayouts(
  params?: { page?: number; page_size?: number },
): Promise<PaginatedResponse<MontageLayout>> {
  return apiGet<PaginatedResponse<MontageLayout>>(
    '/montage_layouts',
    params as Record<string, string | number | undefined>,
  );
}

export async function createMontageLayout(payload: {
  name: string;
  positions: string;
  user_id: number;
}): Promise<MontageLayout> {
  return apiPost<typeof payload, MontageLayout>('/montage_layouts', payload);
}

export async function updateMontageLayout(
  id: number,
  payload: { name?: string; positions?: string },
): Promise<MontageLayout> {
  return apiPatch<typeof payload, MontageLayout>(`/montage_layouts/${id}`, payload);
}

export async function deleteMontageLayout(id: number): Promise<void> {
  return apiDelete(`/montage_layouts/${id}`);
}
