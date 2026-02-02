import { useAuthStore } from '@/stores/auth';
import type { ApiError } from '@/types';

const API_BASE = '/api/v3';

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
      errorMessage = errorData.message || errorData.error || errorMessage;
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

function getAuthHeaders(): HeadersInit {
  const token = useAuthStore.getState().getAccessToken();
  if (token) {
    return {
      Authorization: `Bearer ${token}`,
    };
  }
  return {};
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

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });

  return handleResponse<T>(response);
}

export async function apiPost<T, R = T>(endpoint: string, data?: T): Promise<R> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  return handleResponse<R>(response);
}

export async function apiPatch<T, R = T>(endpoint: string, data: T): Promise<R> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(data),
  });

  return handleResponse<R>(response);
}

export async function apiDelete(endpoint: string): Promise<void> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });

  return handleResponse<void>(response);
}
