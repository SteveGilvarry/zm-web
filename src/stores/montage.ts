import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StreamProtocol } from '@/types';
import type { LayoutNode } from '@/features/montage/mosaic';
import { leaf } from '@/features/montage/mosaic';
import { DEFAULT_STAGE_SIZE, type StageSize } from '@/features/monitors/watchStage';

/**
 * Where a cell's name + runtime-status caption sits. Mirrors legacy
 * `zmMonitorStatusPositionSelected` (`insideImgBottom` / `outsideImgBottom` /
 * `hidden` / `showOnHover`).
 */
export type MontageStatusPosition = 'inside' | 'outside' | 'hidden' | 'hover';

/** Legacy `speed` cookie default on the Montage Review page. */
export const DEFAULT_REVIEW_SPEED = 1;

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
  /** Legacy cookie `zmMontageShowZones`: draw zone polygons over live tiles. */
  showZones: boolean;
  /** Classic Layout select (`preset:<id>` / `saved:<id>`), legacy `zmMontageLayout`. */
  classicLayoutId: string;
  /** Classic montage Width / Height / Scale selects. */
  montageStage: StageSize;
  /** Legacy montagereview `fit` (default on): pack the wall to the viewport. */
  reviewFit: boolean;
  /** Cycle Width / Height / Scale, legacy `zmCycleWidth/Height/Scale`. */
  cycleStage: StageSize;
  /** Montage Review playback multiplier, legacy `speed` cookie. */
  reviewSpeed: number;

  setTree: (next: LayoutNode | ((prev: LayoutNode) => LayoutNode)) => void;
  setProtocol: (protocol: StreamProtocol) => void;
  setStatusPosition: (position: MontageStatusPosition) => void;
  setShowZones: (show: boolean) => void;
  setClassicLayoutId: (id: string) => void;
  setMontageStage: (size: StageSize) => void;
  setReviewFit: (fit: boolean) => void;
  setCycleStage: (size: StageSize) => void;
  setReviewSpeed: (speed: number) => void;
}

export const useMontageStore = create<MontageState>()(
  persist(
    (set, get) => ({
      // Start with an empty single tile; the page replaces it with an Auto
      // layout sized to the fleet on first load.
      tree: leaf(null),
      protocol: 'webrtc',
      // Legacy montage.php default (unless ZM_WEB_COMPACT_MONTAGE → hidden).
      statusPosition: 'outside',
      showZones: false,
      classicLayoutId: 'preset:auto',
      montageStage: DEFAULT_STAGE_SIZE,
      reviewFit: true,
      cycleStage: DEFAULT_STAGE_SIZE,
      reviewSpeed: DEFAULT_REVIEW_SPEED,

      setTree: (next) =>
        set({ tree: typeof next === 'function' ? next(get().tree) : next }),
      setProtocol: (protocol) => set({ protocol }),
      setStatusPosition: (statusPosition) => set({ statusPosition }),
      setShowZones: (showZones) => set({ showZones }),
      setClassicLayoutId: (classicLayoutId) => set({ classicLayoutId }),
      setMontageStage: (montageStage) => set({ montageStage }),
      setReviewFit: (reviewFit) => set({ reviewFit }),
      setCycleStage: (cycleStage) => set({ cycleStage }),
      setReviewSpeed: (reviewSpeed) => set({ reviewSpeed }),
    }),
    {
      name: 'zm-montage',
      partialize: (state) => ({
        tree: state.tree,
        protocol: state.protocol,
        statusPosition: state.statusPosition,
        showZones: state.showZones,
        classicLayoutId: state.classicLayoutId,
        montageStage: state.montageStage,
        reviewFit: state.reviewFit,
        cycleStage: state.cycleStage,
        reviewSpeed: state.reviewSpeed,
      }),
    },
  ),
);
