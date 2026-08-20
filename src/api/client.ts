import { useAuthStore } from '@/stores/auth';
import type { ApiError } from '@/types';

import { API_BASE } from '@/api/base';

export class ApiClientError extends Error {
  status: number;
  details?: Record<string, string>[];

  constructor(message: string, status: number, details?: Record<string, string>[]) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.details = details;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    let details: Record<string, string>[] | undefined;

    try {
      const errorData: ApiError = await response.json();
      // zm_api's envelope is {kind, error_message, code, details}; older shapes used message/error.
      errorMessage = errorData.error_message || errorData.message || errorData.error || errorMessage;
      details = errorData.details;
    } catch {
      // Response wasn't JSON
    }

    throw new ApiClientError(errorMessage, response.status, details);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

/** Current JWT access token, or null if unauthenticated/expired. */
export function getAuthToken(): string | null {
  return useAuthStore.getState().getAccessToken();
}

function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  if (token) {
    return {
      Authorization: `Bearer ${token}`,
    };
  }
  return {};
}

/**
 * Run a fetch with auth headers. If the response is 401 and we haven't
 * already retried, trigger a refresh (deduped across concurrent callers)
 * and retry the original request once. Anything still 401 after that —
 * the refresh failed and the store has cleared auth, so we propagate the
 * error and the root route will redirect to login.
 */
async function authedFetch(url: string, init: RequestInit): Promise<Response> {
  const initWithAuth = (): RequestInit => ({
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...getAuthHeaders(),
    },
  });

  let response = await fetch(url, initWithAuth());
  if (response.status !== 401) return response;

  // 401 — try to refresh once and retry.
  const newToken = await useAuthStore.getState().refresh();
  if (!newToken) return response; // refresh failed; let caller handle the 401

  response = await fetch(url, initWithAuth());
  return response;
}

export async function apiGet<T>(endpoint: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${API_BASE}${endpoint}`, window.location.origin);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  const response = await authedFetch(url.toString(), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  return handleResponse<T>(response);
}

export async function apiPost<T, R = T>(endpoint: string, data?: T): Promise<R> {
  const response = await authedFetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  });

  return handleResponse<R>(response);
}

export async function apiPatch<T, R = T>(endpoint: string, data: T): Promise<R> {
  const response = await authedFetch(`${API_BASE}${endpoint}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  return handleResponse<R>(response);
}

export async function apiPut<T, R = T>(endpoint: string, data: T): Promise<R> {
  const response = await authedFetch(`${API_BASE}${endpoint}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  return handleResponse<R>(response);
}

export async function apiDelete(endpoint: string): Promise<void> {
  const response = await authedFetch(`${API_BASE}${endpoint}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });

  return handleResponse<void>(response);
}
