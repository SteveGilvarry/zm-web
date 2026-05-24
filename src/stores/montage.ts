import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StreamProtocol } from '@/types';
import type { LayoutNode } from '@/features/montage/mosaic';
import { leaf } from '@/features/montage/mosaic';

interface MontageState {
  /**
   * Layout tree describing how the viewport is split between monitors.
   * Replaces the old fixed grid (1×1/2×2/3×3/4×4). Preset layouts are
   * just trees with conventional shapes; the operator can split/resize
   * any further.
   */
  tree: LayoutNode;
  protocol: StreamProtocol;

  setTree: (next: LayoutNode | ((prev: LayoutNode) => LayoutNode)) => void;
  setProtocol: (protocol: StreamProtocol) => void;
}

export const useMontageStore = create<MontageState>()(
  persist(
    (set, get) => ({
      // Start with an empty single tile; the route auto-populates it
      // with the first available monitor on mount.
      tree: leaf(null),
      protocol: 'webrtc',

      setTree: (next) =>
        set({ tree: typeof next === 'function' ? next(get().tree) : next }),
      setProtocol: (protocol) => set({ protocol }),
    }),
    {
      name: 'zm-montage',
      partialize: (state) => ({
        tree: state.tree,
        protocol: state.protocol,
      }),
    },
  ),
);
