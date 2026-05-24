import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserClaims } from '@/types';
import { refreshToken as refreshTokenApi } from '@/api/auth';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserClaims | null;
  isAuthenticated: boolean;

  // Actions
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  getAccessToken: () => string | null;
  /**
   * Force-refresh the access token using the stored refresh token. Returns
   * the new access token on success or null on failure. Concurrent calls
   * dedupe to a single in-flight request — apiGet/apiPost/etc. all share
   * this so a burst of 401s only triggers one refresh.
   */
  refresh: () => Promise<string | null>;
}

function parseJwt(token: string): UserClaims | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function isTokenExpired(claims: UserClaims | null): boolean {
  if (!claims) return true;
  // Add 30 second buffer
  return Date.now() >= (claims.exp * 1000) - 30000;
}

/* ------------------------------------------------------------------------ */
/*  Module-scoped state for the background refresh loop                     */
/* ------------------------------------------------------------------------ */

// Timer that triggers a refresh ~30s before the current access token expires.
// Lives outside the store because it's not serialisable.
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

// Dedupe concurrent refresh calls. If a burst of API requests all 401 at
// once, the first triggers the network call and the rest await the same
// promise.
let inflightRefresh: Promise<string | null> | null = null;

function clearRefreshTimer() {
  if (refreshTimer != null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

/** How long until we should next refresh, in ms. Negative if already due. */
function msUntilRefreshDue(claims: UserClaims | null): number {
  if (!claims) return -1;
  // 60s before exp gives the request room to land and propagate before any
  // outstanding API calls hit a 401. Floor at 5s so a stale clock can't
  // pin the timer at zero and burn cycles.
  return Math.max(5_000, claims.exp * 1000 - Date.now() - 60_000);
}

/* ------------------------------------------------------------------------ */
/*  Store                                                                   */
/* ------------------------------------------------------------------------ */

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => {
      // Schedule the next refresh based on the access token's exp claim.
      // Called from setTokens (after login or after a successful refresh)
      // and on rehydrate (so a page reload picks the schedule back up).
      const scheduleRefresh = () => {
        clearRefreshTimer();
        const { user, refreshToken } = get();
        if (!user || !refreshToken) return;
        const delay = msUntilRefreshDue(user);
        if (delay < 0) {
          // Already expired — fire immediately so the user doesn't see a 401
          // on their next API call.
          void get().refresh();
          return;
        }
        refreshTimer = setTimeout(() => {
          void get().refresh();
        }, delay);
      };

      return {
        accessToken: null,
        refreshToken: null,
        user: null,
        isAuthenticated: false,

        setTokens: (accessToken: string, refreshToken: string) => {
          const user = parseJwt(accessToken);
          set({
            accessToken,
            refreshToken,
            user,
            isAuthenticated: !isTokenExpired(user),
          });
          scheduleRefresh();
        },

        clearAuth: () => {
          clearRefreshTimer();
          inflightRefresh = null;
          set({
            accessToken: null,
            refreshToken: null,
            user: null,
            isAuthenticated: false,
          });
        },

        getAccessToken: () => get().accessToken,

        refresh: () => {
          // Dedupe — if a refresh is already running, share its promise.
          if (inflightRefresh) return inflightRefresh;

          const { refreshToken: rt } = get();
          if (!rt) return Promise.resolve(null);

          inflightRefresh = (async () => {
            try {
              const resp = await refreshTokenApi(rt);
              // Update the store via setTokens so the schedule resets onto
              // the new exp.
              get().setTokens(resp.access_token, resp.refresh_token);
              return resp.access_token;
            } catch {
              // Refresh failed — the refresh token has likely expired too.
              // Clear auth so the root route bounces to login.
              get().clearAuth();
              return null;
            } finally {
              inflightRefresh = null;
            }
          })();

          return inflightRefresh;
        },
      };
    },
    {
      name: 'zm-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // After a page reload, the access token may already be expired or
        // close to it. Trigger a refresh kick so we don't fire the first
        // API call with a dead token.
        if (state?.refreshToken) {
          if (isTokenExpired(state.user)) {
            void state.refresh();
          } else {
            // Schedule normally — call refresh() now will dedupe, but easier
            // to just let setTokens-style scheduling kick in via a manual
            // trigger.
            const delay = msUntilRefreshDue(state.user);
            if (delay >= 0) {
              clearRefreshTimer();
              refreshTimer = setTimeout(() => {
                void state.refresh();
              }, delay);
            }
          }
        }
      },
    }
  )
);
