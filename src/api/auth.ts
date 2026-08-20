import type { LoginRequest, TokenResponse } from '@/types';
import { useAuthStore } from '@/stores/auth';
import i18next from '@/i18n';

const API_BASE = '/api/v3';

export async function login(credentials: LoginRequest): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: '' }));
    throw new Error(error.message || i18next.t('Login failed'));
  }

  return response.json();
}

/**
 * Server-side logout. The OpenAPI route is `GET /auth/logout` (POST → 405).
 * Takes the token from the store; callers still clear local auth themselves.
 */
export async function logout(token?: string): Promise<void> {
  const bearer = token ?? useAuthStore.getState().accessToken;
  if (!bearer) return;
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${bearer}` },
  });
}

export async function refreshToken(refreshToken: string): Promise<TokenResponse> {
  // Backend's RefreshTokenRequest schema wants {token: ...} — the
  // previous {refresh_token: ...} shape returned 422 silently.
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token: refreshToken }),
  });

  if (!response.ok) {
    throw new Error(i18next.t('Token refresh failed'));
  }

  return response.json();
}
