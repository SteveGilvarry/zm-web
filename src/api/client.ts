import { useAuthStore } from '@/stores/auth';
import type { ApiError } from '@/types';
import i18next from '@/i18n';

import { API_BASE } from '@/api/base';

/**
 * What went wrong, coarsely, so UI can pick the right message:
 *  - `network`: fetch itself failed (DNS, refused, CORS, offline) — status 0.
 *  - `server`: 5xx.
 *  - `forbidden`: 403 — authenticated but not permitted.
 *  - `unauthorized`: 401 that survived the refresh-and-retry.
 *  - `not_found`: 404.
 *  - `client`: any other 4xx (validation, conflict, …).
 */
export type ApiErrorKind =
  | 'network'
  | 'server'
  | 'forbidden'
  | 'unauthorized'
  | 'not_found'
  | 'client'
  | 'unknown';

export class ApiClientError extends Error {
  status: number;
  details?: Record<string, string>[];

  constructor(message: string, status: number, details?: Record<string, string>[]) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.details = details;
  }

  get kind(): ApiErrorKind {
    return kindForStatus(this.status);
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** Network failure or 5xx: the backend, not the request, is the problem. */
  get isUnreachable(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 0) return 'network';
  if (status >= 500) return 'server';
  if (status === 403) return 'forbidden';
  if (status === 401) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status >= 400) return 'client';
  return 'unknown';
}

/** Classify any thrown value. Non-`ApiClientError` `TypeError`s are what
 *  `fetch` throws when it cannot reach the host at all. */
export function classifyApiError(error: unknown): ApiErrorKind {
  if (error instanceof ApiClientError) return error.kind;
  if (error instanceof TypeError) return 'network';
  return 'unknown';
}

/** True when the failure says "backend down", not "bad request". */
export function isBackendUnreachable(error: unknown): boolean {
  const kind = classifyApiError(error);
  return kind === 'network' || kind === 'server';
}

/**
 * TanStack Query `retry` predicate: retry transient failures (network, 5xx)
 * up to `maxRetries` times, never a 4xx — a 403 or 422 will not get better
 * by asking again, and retrying only delays the error state.
 */
export function shouldRetryQuery(failureCount: number, error: unknown, maxRetries = 2): boolean {
  if (failureCount >= maxRetries) return false;
  const kind = classifyApiError(error);
  return kind === 'network' || kind === 'server' || kind === 'unknown';
}

/** A human-readable message for any error the API layer can throw. */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.kind === 'network') return i18next.t('Cannot reach the server.');
    if (error.kind === 'forbidden') return i18next.t('You do not have permission to do this.');
    return error.message;
  }
  if (error instanceof TypeError) return i18next.t('Cannot reach the server.');
  if (error instanceof Error && error.message) return error.message;
  return i18next.t('Something went wrong.');
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    let details: Record<string, string>[] | undefined;

    try {
      const errorData: ApiError = await response.json();
      // zm-api's envelope is {kind, error_message, code, details}; older shapes used message/error.
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

  let response = await networkFetch(url, initWithAuth());
  if (response.status !== 401) return response;

  // 401 — try to refresh once and retry.
  const newToken = await useAuthStore.getState().refresh();
  if (!newToken) return response; // refresh failed; let caller handle the 401

  response = await networkFetch(url, initWithAuth());
  return response;
}

/**
 * `fetch` rejects with a bare `TypeError("Failed to fetch")` when the host is
 * unreachable. Surface that as an `ApiClientError` with status 0 so callers
 * have one error type to inspect and the UI can say "backend down" rather
 * than echoing a browser string.
 */
async function networkFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    if (err instanceof TypeError) {
      throw new ApiClientError(i18next.t('Cannot reach the server.'), 0);
    }
    throw err;
  }
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
