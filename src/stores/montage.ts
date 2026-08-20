import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StreamProtocol } from '@/types';
import type { LayoutNode } from '@/features/montage/mosaic';
import { leaf } from '@/features/montage/mosaic';

/**
 * Where a cell's name + runtime-status caption sits. Mirrors legacy
 * `zmMonitorStatusPositionSelected` (`insideImgBottom` / `outsideImgBottom` /
 * `hidden`), minus the hover variant.
 */
export type MontageStatusPosition = 'inside' | 'outside' | 'hidden';

interface MontageState {
  /**
   * Layout tree describing how the viewport is split between monitors.
   * Replaces the old fixed grid (1×1/2×2/3×3/4×4). Preset layouts are
   * just trees with conventional shapes; the operator can split/resize
   * any further.
   */
  tree: LayoutNode;
  protocol: StreamProtocol;
  statusPosition: MontageStatusPosition;

  setTree: (next: LayoutNode | ((prev: LayoutNode) => LayoutNode)) => void;
  setProtocol: (protocol: StreamProtocol) => void;
  setStatusPosition: (position: MontageStatusPosition) => void;
}

export const useMontageStore = create<MontageState>()(
  persist(
    (set, get) => ({
      // Start with an empty single tile; the page replaces it with an Auto
      // layout sized to the fleet on first load.
      tree: leaf(null),
      protocol: 'webrtc',
      statusPosition: 'inside',

      setTree: (next) =>
        set({ tree: typeof next === 'function' ? next(get().tree) : next }),
      setProtocol: (protocol) => set({ protocol }),
      setStatusPosition: (statusPosition) => set({ statusPosition }),
    }),
    {
      name: 'zm-montage',
      partialize: (state) => ({
        tree: state.tree,
        protocol: state.protocol,
        statusPosition: state.statusPosition,
      }),
    },
  ),
);
