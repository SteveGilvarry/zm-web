import { apiGet, apiPost } from './client';
import type { PaginatedResponse } from '@/types';

/** A row of ZoneMinder's `Manufacturers` table (the legacy General-tab picker). */
export interface Manufacturer {
  id: number;
  name: string;
}

export async function listManufacturers(
  params?: { page?: number; page_size?: number },
): Promise<PaginatedResponse<Manufacturer>> {
  return apiGet<PaginatedResponse<Manufacturer>>(
    '/manufacturers',
    params as Record<string, string | number | undefined>,
  );
}

/** The legacy "enter new manufacturer" path: POST, then select the new id. */
export async function createManufacturer(name: string): Promise<Manufacturer> {
  return apiPost<{ name: string }, Manufacturer>('/manufacturers', { name });
}
