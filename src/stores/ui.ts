import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { SkinId } from '@/skins/types';

/** Visual skin / layout family for the entire app shell. */
export type Skin = SkinId;

interface UiState {
  /** Sidebar collapsed state (modern skin). */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  /** Active visual skin. */
  skin: Skin;
  setSkin: (skin: Skin) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      skin: 'modern',
      setSkin: (skin) => set({ skin }),
    }),
    {
      name: 'zm-ui',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        skin: state.skin,
      }),
    },
  ),
);
