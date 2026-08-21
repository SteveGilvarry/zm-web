import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { SkinId } from '@/skins/types';

/** Visual skin / layout family for the entire app shell. */
export type Skin = SkinId;

/**
 * Colour scheme preference. `system` follows `prefers-color-scheme`; the
 * other two pin it. Only skins that declare both schemes react to it — the
 * classic skin is light-only (see the token layer in `src/index.css`).
 */
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_OPTIONS: readonly ThemePreference[] = ['system', 'light', 'dark'];

interface UiState {
  /** Sidebar collapsed state (modern skin). */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  /** Active visual skin. */
  skin: Skin;
  setSkin: (skin: Skin) => void;

  /** Light/dark preference, stamped on <html> as `data-theme`. */
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;

  /**
   * Cap on simultaneous live tiles (console thumbnails, montage cells,
   * review-live cells). Tiles are already gated on viewport visibility; this
   * bounds what a large wall can open at once. Each tile is a WebRTC or HLS
   * session on the backend, so raise it with the box's transcoding budget.
   */
  maxLiveTiles: number;
  setMaxLiveTiles: (n: number) => void;
}

export const DEFAULT_MAX_LIVE_TILES = 12;
export const MAX_LIVE_TILES_OPTIONS = [4, 8, 12, 16, 24, 32, 48] as const;

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      skin: 'modern',
      setSkin: (skin) => set({ skin }),

      theme: 'system',
      setTheme: (theme) => set({ theme }),

      maxLiveTiles: DEFAULT_MAX_LIVE_TILES,
      setMaxLiveTiles: (n) =>
        set({ maxLiveTiles: Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_MAX_LIVE_TILES }),
    }),
    {
      name: 'zm-ui',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        skin: state.skin,
        theme: state.theme,
        maxLiveTiles: state.maxLiveTiles,
      }),
    },
  ),
);
