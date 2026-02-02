import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserClaims } from '@/types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserClaims | null;
  isAuthenticated: boolean;

  // Actions
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  getAccessToken: () => string | null;
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

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
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
      },

      clearAuth: () => {
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        });
      },

      getAccessToken: () => {
        const state = get();
        if (isTokenExpired(state.user)) {
          // Token expired, clear auth
          // TODO: Implement refresh token flow
          state.clearAuth();
          return null;
        }
        return state.accessToken;
      },
    }),
    {
      name: 'zm-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
