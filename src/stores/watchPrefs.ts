import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StreamProtocol } from '@/types';
import type { EventsColumnKey } from './eventsColumns';

/**
 * Watch page preferences that legacy keeps in cookies, so they survive a
 * reload: `zmWatchScaleNew<mid>`, `zmWatchPlayer`, `zmWatchVolume`,
 * `zmWatchMuted`, `zmCyclePeriod`, `ptzShow` and the events table's column
 * choice (`zmEventListTable`). Shared by both skins.
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
  /** Columns the operator hid on the watch page's events table. */
  eventColumnsHidden: EventsColumnKey[];
  toggleEventColumn: (key: EventsColumnKey) => void;
  showAllEventColumns: () => void;
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
      eventColumnsHidden: [],
      toggleEventColumn: (key) =>
        set((s) => ({
          eventColumnsHidden: s.eventColumnsHidden.includes(key)
            ? s.eventColumnsHidden.filter((k) => k !== key)
            : [...s.eventColumnsHidden, key],
        })),
      showAllEventColumns: () => set({ eventColumnsHidden: [] }),
    }),
    { name: 'zm-watch-prefs' },
  ),
);
