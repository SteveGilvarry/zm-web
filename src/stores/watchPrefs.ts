import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StreamProtocol } from '@/types';

/**
 * Watch page preferences that legacy keeps in cookies, so they survive a
 * reload: `zmWatchScaleNew<mid>`, `zmWatchPlayer`, `zmWatchVolume`,
 * `zmWatchMuted`, `zmCyclePeriod` and `ptzShow`. Shared by both skins; the
 * data hooks read and write them, the pages never touch the store directly.
 */
interface WatchPrefsState {
  /** Last player the operator picked by hand; a fallback is not a pick. */
  player: StreamProtocol | null;
  setPlayer: (p: StreamProtocol) => void;
  /** 0–1. */
  volume: number;
  setVolume: (v: number) => void;
  muted: boolean;
  setMuted: (m: boolean) => void;
  /** Scale select value per monitor id. */
  scaleByMonitor: Record<string, string>;
  setScale: (monitorId: number, scale: string) => void;
  /** Cycle sidebar period in seconds; null until the operator picks one. */
  cyclePeriodS: number | null;
  setCyclePeriod: (s: number) => void;
  /** The PTZ panel's visibility (`ptzShow`); legacy shows it by default. */
  ptzShow: boolean;
  togglePtzShow: () => void;
}

export const useWatchPrefsStore = create<WatchPrefsState>()(
  persist(
    (set) => ({
      player: null,
      setPlayer: (player) => set({ player }),
      volume: 1,
      setVolume: (volume) => set({ volume }),
      muted: true,
      setMuted: (muted) => set({ muted }),
      scaleByMonitor: {},
      setScale: (monitorId, scale) =>
        set((s) => ({ scaleByMonitor: { ...s.scaleByMonitor, [String(monitorId)]: scale } })),
      cyclePeriodS: null,
      setCyclePeriod: (cyclePeriodS) => set({ cyclePeriodS }),
      ptzShow: true,
      togglePtzShow: () => set((s) => ({ ptzShow: !s.ptzShow })),
    }),
    { name: 'zm-watch-prefs' },
  ),
);
