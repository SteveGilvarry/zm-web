import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Column-visibility state for the events list. Legacy ZM persists this in a
 * cookie (`zmEventsTable`, 2-year expiry); we mirror the behaviour via
 * localStorage so an operator's column choices survive across reloads.
 *
 * The set of *known* columns is fixed below. Only the *hidden* set is
 * persisted, so that adding a new default-visible column in the future
 * doesn't silently hide it for existing users.
 */
export type EventsColumnKey =
  | 'id'
  | 'monitor'
  | 'name'
  | 'cause'
  | 'time'
  | 'end'
  | 'duration'
  | 'frames'
  | 'alarm_frames'
  | 'tot_score'
  | 'avg_score'
  | 'max_score'
  | 'tags'
  | 'disk_space'
  | 'archived';

export interface EventsColumnDef {
  key: EventsColumnKey;
  label: string;
  /** Whether the column appears by default. */
  defaultVisible: boolean;
}

/**
 * Single source of truth for events-list columns. The order here matches the
 * order operators see in the table header.
 */
export const EVENTS_COLUMNS: EventsColumnDef[] = [
  { key: 'id',           label: 'ID',       defaultVisible: true },
  { key: 'monitor',      label: 'Monitor',  defaultVisible: true },
  { key: 'name',         label: 'Name',     defaultVisible: true },
  { key: 'cause',        label: 'Cause',    defaultVisible: true },
  { key: 'time',         label: 'Time',     defaultVisible: true },
  { key: 'end',          label: 'End',      defaultVisible: false },
  { key: 'duration',     label: 'Duration', defaultVisible: true },
  { key: 'frames',       label: 'Frames',   defaultVisible: true },
  { key: 'alarm_frames', label: 'Alarm',    defaultVisible: true },
  { key: 'tot_score',    label: 'Tot',      defaultVisible: true },
  { key: 'avg_score',    label: 'Avg',      defaultVisible: true },
  { key: 'max_score',    label: 'Max',      defaultVisible: true },
  { key: 'tags',         label: 'Tags',     defaultVisible: true },
  // Off by default — the spec calls these out as legacy columns operators
  // sometimes want, but the default-on set should match what we shipped.
  { key: 'disk_space',   label: 'DiskSpace', defaultVisible: false },
  { key: 'archived',     label: 'Archived',  defaultVisible: false },
];

interface EventsColumnsState {
  /** Column keys explicitly hidden by the operator. */
  hidden: EventsColumnKey[];
  /** Toggle one column's visibility. */
  toggle: (key: EventsColumnKey) => void;
  /** Show every known column. */
  showAll: () => void;
  /** Reset to the shipped defaults. */
  resetDefaults: () => void;
  /** Predicate for use in render. */
  isVisible: (key: EventsColumnKey) => boolean;
}

const initialHidden = (): EventsColumnKey[] =>
  EVENTS_COLUMNS.filter((c) => !c.defaultVisible).map((c) => c.key);

export const useEventsColumnsStore = create<EventsColumnsState>()(
  persist(
    (set, get) => ({
      hidden: initialHidden(),
      toggle: (key) =>
        set((s) => {
          const has = s.hidden.includes(key);
          return {
            hidden: has ? s.hidden.filter((k) => k !== key) : [...s.hidden, key],
          };
        }),
      showAll: () => set({ hidden: [] }),
      resetDefaults: () => set({ hidden: initialHidden() }),
      isVisible: (key) => !get().hidden.includes(key),
    }),
    {
      name: 'zm-events-columns',
      // localStorage — the column layout is a user preference, not a
      // per-tab working set, so we want it to outlive the session.
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ hidden: state.hidden }),
    },
  ),
);
