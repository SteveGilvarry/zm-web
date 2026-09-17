import { apiGet } from './client';
import type { PaginatedResponse } from '@/types';

/** A row of ZoneMinder's `User_Preferences` table (`/api/v3/user_preferences`). */
export interface UserPreference {
  id: number;
  user_id: number;
  name?: string | null;
  value?: string | null;
}

export async function listUserPreferences(
  params?: { page?: number; page_size?: number },
): Promise<PaginatedResponse<UserPreference>> {
  return apiGet<PaginatedResponse<UserPreference>>(
    '/user_preferences',
    params as Record<string, string | number | undefined>,
  );
}
