import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * The legacy filter row's fields that the modern chip bar does not model:
 * Name and Source (regexes), Status (the *runtime* state, plus the `Deleted`
 * pseudo-status), Server and Storage. Legacy keeps each in a `zmFilter_*`
 * cookie, so a selection made on Console is still there on Montage, Cycle,
 * Montage Review, Watch and Events. Group / Capturing / Analysing /
 * Recording / Monitor live in `useMonitorFilterStore`, shared with the chip
 * bar.
 *
 * Read and written only through `useMonitorFilterRow`. Values are the row's
 * wire strings, multi-selects comma-joined (`"Connected,Deleted"`).
 *
 * sessionStorage, like `useMonitorFilterStore`, so both halves of the row
 * live and die together.
 */
export type MonitorFilterRowStoreField = 'name' | 'source' | 'status' | 'serverId' | 'storageId';

type Values = Record<MonitorFilterRowStoreField, string>;

interface MonitorFilterRowStoreState extends Values {
  setField: (field: MonitorFilterRowStoreField, value: string) => void;
  reset: () => void;
}

const EMPTY: Values = { name: '', source: '', status: '', serverId: '', storageId: '' };

export const useMonitorFilterRowStore = create<MonitorFilterRowStoreState>()(
  persist(
    (set) => ({
      ...EMPTY,
      setField: (field, value) => set({ [field]: value } as Partial<Values>),
      reset: () => set({ ...EMPTY }),
    }),
    {
      name: 'zm-monitor-filter-row',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        name: s.name, source: s.source, status: s.status, serverId: s.serverId, storageId: s.storageId,
      }),
    },
  ),
);
