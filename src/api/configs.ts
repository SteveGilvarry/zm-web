import { apiGet, apiPut } from './client';
import type { ZmConfig, PaginatedResponse } from '@/types';

export async function getConfigs(params?: {
  page?: number;
  page_size?: number;
  category?: string;
}): Promise<PaginatedResponse<ZmConfig>> {
  return apiGet<PaginatedResponse<ZmConfig>>('/configs', params);
}

export async function updateConfig(
  name: string,
  value: string
): Promise<ZmConfig> {
  return apiPut<{ value: string }, ZmConfig>(`/configs/${encodeURIComponent(name)}`, { value });
}

/** One config row by name, e.g. `ZM_WEB_EVENTS_PER_PAGE`. */
export async function getConfig(name: string): Promise<ZmConfig> {
  return apiGet<ZmConfig>(`/configs/${encodeURIComponent(name)}`);
}
