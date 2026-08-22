import { ApiClientError, apiGet, getAuthToken } from './client';
import { API_BASE } from './base';
import type { User } from '@/types';

/**
 * The signed-in operator, straight from the server.
 *
 * The alternative — the access token's `perms` claim — is a snapshot taken at
 * login, so an admin who changes someone's permissions only reaches them on
 * their next sign-in. `GET /me` is live, and its 8 permission columns are
 * top-level strings on the user.
 *
 * Two response shapes in the wild. zm_api used to return `UserResponse`, the
 * same object `/users/{id}` returns; current builds return `MeResponse`, which
 * wraps it as `{ user, issued_at, expires_at, token_type }`. Reading the
 * wrapper as a user yields no permission columns at all, which is not a
 * degraded state — `permsFromUser` reads that as None on every feature and
 * the UI hides the live wall and every edit control. So unwrap, and keep
 * accepting the flat shape for older backends.
 *
 * Needs a zm_api that serves `/me`; older builds 404 and callers fall back to
 * the claim.
 */
export async function getMe(): Promise<User> {
  const body = await apiGet<User | MeResponse>('/me');
  return isWrapped(body) ? body.user : body;
}

/** The current shape: the user plus metadata about the token that fetched it. */
interface MeResponse {
  user: User;
  issued_at?: string;
  expires_at?: string;
  token_type?: string;
}

function isWrapped(body: User | MeResponse): body is MeResponse {
  return typeof (body as MeResponse).user === 'object' && (body as MeResponse).user !== null;
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
