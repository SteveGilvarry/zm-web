import { apiGet } from './client';
import type { PaginatedResponse } from '@/types';

/**
 * Rows of ZoneMinder's `Sessions` table: the PHP UI's sessions, stored by
 * `includes/session.php`. zm-api's own logins are JWTs and never appear
 * here; legacy's logout modal lists these as "Other logged in users".
 */
export interface ZmSession {
  /** PHP session id. */
  id: string;
  /** Unix time of the last request. */
  access?: number | null;
  /** PHP `session_encode()` output: `username|s:5:"admin";remoteAddr|s:…`. */
  data?: string | null;
}

export async function listSessions(params?: { page?: number; page_size?: number }): Promise<PaginatedResponse<ZmSession>> {
  return apiGet<PaginatedResponse<ZmSession>>('/sessions', params);
}
