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
  | 'storage'
  | 'disk_space'
  | 'archived'
  | 'emailed';

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
  // Legacy `?view=events` order (after the Thumbnail column).
  { key: 'id',           label: 'Id',           defaultVisible: true },
  { key: 'name',         label: 'Name',         defaultVisible: true },
  { key: 'archived',     label: 'Archived',     defaultVisible: true },
  { key: 'emailed',      label: 'Emailed',      defaultVisible: false },
  { key: 'monitor',      label: 'Monitor',      defaultVisible: true },
  { key: 'cause',        label: 'Cause',        defaultVisible: true },
  { key: 'tags',         label: 'Tags',         defaultVisible: true },
  { key: 'time',         label: 'Start Time',   defaultVisible: true },
  { key: 'end',          label: 'End Time',     defaultVisible: true },
  { key: 'duration',     label: 'Duration',     defaultVisible: true },
  { key: 'frames',       label: 'Frames',       defaultVisible: true },
  { key: 'alarm_frames', label: 'Alarm Frames', defaultVisible: true },
  { key: 'tot_score',    label: 'Total Score',  defaultVisible: true },
  { key: 'avg_score',    label: 'Avg. Score',   defaultVisible: true },
  { key: 'max_score',    label: 'Max. Score',   defaultVisible: true },
  { key: 'storage',      label: 'Storage',      defaultVisible: true },
  { key: 'disk_space',   label: 'DiskSpace',    defaultVisible: true },
];

/** How the modern events list draws its rows. */
export type EventsView = 'table' | 'cards';

interface EventsColumnsState {
  /** Column keys explicitly hidden by the operator. */
  hidden: EventsColumnKey[];
  /**
   * Table by default: an operator scans a list, and the card layout fits
   * three and a half events on a screen where the table fits twenty (see
   * docs/DESIGN.md). Cards stay available for browsing by thumbnail.
   */
  view: EventsView;
  setView: (view: EventsView) => void;
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
      view: 'table',
      setView: (view) => set({ view }),
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
      partialize: (state) => ({ hidden: state.hidden, view: state.view }),
    },
  ),
);
