import { ApiClientError, apiGet, getAuthToken } from './client';
import { API_BASE } from './base';
import type { User } from '@/types';

/**
 * The signed-in operator, straight from the server.
 *
 * The alternative — the access token's `perms` claim — is a snapshot taken at
 * login, so an admin who changes someone's permissions only reaches them on
 * their next sign-in. `GET /me` is live, and returns the same `UserResponse`
 * shape as `/users/{id}`: the 8 permission columns are top-level strings.
 *
 * Needs a zm_api that serves `/me`; older builds 404 and callers fall back to
 * the claim.
 */
export async function getMe(): Promise<User> {
  return apiGet<User>('/me');
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

/**
 * Self-service password change. Distinct from `updateUser()`, which needs
 * `system: Edit` and cannot target your own credentials without it.
 *
 * Deliberately not `apiPut`: a 401 from this route means "current password
 * is wrong", and `apiPut` reads any 401 as a dead token — it would burn a
 * refresh and, if that refresh failed, sign the operator out for a typo.
 *
 * On success the backend revokes the caller's tokens (both access and
 * refresh stop working immediately), so callers must clear the session.
 */
export async function changeMyPassword(
  payload: ChangePasswordPayload,
): Promise<{ message: string }> {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE}/me/password`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const envelope = await response.json().catch(() => ({}));
    throw new ApiClientError(
      envelope.error_message || envelope.message || `HTTP ${response.status}`,
      response.status,
    );
  }
  return response.json();
}
