import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * State for the shared <MonitorFilterBar/> mounted on Console, Montage, and
 * Montage Review. Each chip stores the SELECTED option set; an empty array
 * means "no filter applied" (i.e. every value passes).
 *
 * Selections persist in sessionStorage so refining a filter on Console and
 * navigating to Montage carries the choices over without forcing the
 * operator to redo them. We deliberately use sessionStorage (not
 * localStorage) — the filter is a transient working set, not a permanent
 * preference, and survives only the current browser tab session.
 */
export interface MonitorFilterState {
  /** Selected group ids. Empty = "all groups". */
  groupIds: number[];
  /** Selected `Monitor.capturing` values. */
  capturing: string[];
  /** Selected `Monitor.analysing` values. */
  analysing: string[];
  /** Selected `Monitor.recording` values. */
  recording: string[];
  /** Selected status tokens — currently `'active' | 'disabled'`. */
  status: string[];
  /** Selected `Monitor.type` values (Ffmpeg / Libvlc / …). */
  source: string[];
  /** Selected monitor ids (rare — usually narrowed by attribute instead). */
  monitorIds: number[];

  setGroupIds: (v: number[]) => void;
  setCapturing: (v: string[]) => void;
  setAnalysing: (v: string[]) => void;
  setRecording: (v: string[]) => void;
  setStatus: (v: string[]) => void;
  setSource: (v: string[]) => void;
  setMonitorIds: (v: number[]) => void;

  /** Clear every chip back to "all". */
  reset: () => void;
}

const EMPTY: Omit<
  MonitorFilterState,
  | 'setGroupIds'
  | 'setCapturing'
  | 'setAnalysing'
  | 'setRecording'
  | 'setStatus'
  | 'setSource'
  | 'setMonitorIds'
  | 'reset'
> = {
  groupIds: [],
  capturing: [],
  analysing: [],
  recording: [],
  status: [],
  source: [],
  monitorIds: [],
};

export const useMonitorFilterStore = create<MonitorFilterState>()(
  persist(
    (set) => ({
      ...EMPTY,
      setGroupIds:   (v) => set({ groupIds: v }),
      setCapturing:  (v) => set({ capturing: v }),
      setAnalysing:  (v) => set({ analysing: v }),
      setRecording:  (v) => set({ recording: v }),
      setStatus:     (v) => set({ status: v }),
      setSource:     (v) => set({ source: v }),
      setMonitorIds: (v) => set({ monitorIds: v }),
      reset: () => set({ ...EMPTY }),
    }),
    {
      name: 'zm-monitor-filter',
      // sessionStorage — the filter is per-session, not per-user-forever.
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        groupIds: state.groupIds,
        capturing: state.capturing,
        analysing: state.analysing,
        recording: state.recording,
        status: state.status,
        source: state.source,
        monitorIds: state.monitorIds,
      }),
    },
  ),
);
