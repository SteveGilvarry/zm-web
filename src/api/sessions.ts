import { apiGet, apiPost, apiDelete } from './client';
import type { PaginatedResponse } from '@/types';

/** Persistent session / API-token record. */
export interface Session {
  id: string;
  /** Bitmask of access flags (admin = 0xff, read-only = 0x01 etc). */
  access?: number | null;
  /** Free-form data — used by zm_api for token metadata. */
  data?: string | null;
}

export async function listSessions(
  params?: { page?: number; page_size?: number },
): Promise<PaginatedResponse<Session>> {
  return apiGet<PaginatedResponse<Session>>(
    '/sessions',
    params as Record<string, string | number | undefined>,
  );
}

export async function createSession(payload: { id: string; access?: number; data?: string }): Promise<Session> {
  return apiPost<typeof payload, Session>('/sessions', payload);
}

export async function deleteSession(id: string): Promise<void> {
  return apiDelete(`/sessions/${encodeURIComponent(id)}`);
}
