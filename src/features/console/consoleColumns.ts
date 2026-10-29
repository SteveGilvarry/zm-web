import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TFunction } from 'i18next';

/** Legacy console columns in legacy order (`console.php` header row). */
export const CONSOLE_COLUMNS = [
  'id', 'thumbnail', 'name', 'manufacturer', 'model', 'function', 'server', 'source', 'storage',
  'events', 'hour', 'day', 'week', 'month', 'archived', 'zones', 'sequence',
] as const;

export type ConsoleColumnKey = (typeof CONSOLE_COLUMNS)[number];

/** Hidden until the operator turns them on — same as the legacy cookie default. */
export const DEFAULT_HIDDEN: readonly ConsoleColumnKey[] = ['manufacturer', 'model', 'sequence'];

/** The table state legacy's `zmConsoleTable` cookie keeps besides the columns. */
export interface ConsoleTableView {
  /** Sort column; `sequence` is legacy's initial sort. */
  sortKey: Exclude<ConsoleColumnKey, 'thumbnail'>;
  sortDir: 'asc' | 'desc';
  /** `null` until the operator picks one: `ZM_WEB_EVENTS_PER_PAGE` applies. */
  pageSize: number | null;
  page: number;
  search: string;
}

const DEFAULT_VIEW: ConsoleTableView = { sortKey: 'sequence', sortDir: 'asc', pageSize: null, page: 1, search: '' };

interface ConsoleColumnsState extends ConsoleTableView {
  hidden: ConsoleColumnKey[];
  toggle: (key: ConsoleColumnKey) => void;
  isVisible: (key: ConsoleColumnKey) => boolean;
  /** The Columns dropdown's reset: visibility only. */
  resetColumns: () => void;
  setView: (patch: Partial<ConsoleTableView>) => void;
  /** Everything back to first-run state. */
  reset: () => void;
}

/**
 * Column visibility, sort, page size, page and search, persisted as legacy's
 * bootstrap-table `zmConsoleTable` cookie keeps them (console.php:242-246).
 */
export const useConsoleColumnsStore = create<ConsoleColumnsState>()(
  persist(
    (set, get) => ({
      hidden: [...DEFAULT_HIDDEN],
      ...DEFAULT_VIEW,
      toggle: (key) =>
        set((s) => ({
          hidden: s.hidden.includes(key) ? s.hidden.filter((k) => k !== key) : [...s.hidden, key],
        })),
      isVisible: (key) => !get().hidden.includes(key),
      resetColumns: () => set({ hidden: [...DEFAULT_HIDDEN] }),
      setView: (patch) => set(patch),
      reset: () => set({ hidden: [...DEFAULT_HIDDEN], ...DEFAULT_VIEW }),
    }),
    {
      name: 'zm-console-columns',
      partialize: (s) => ({
        hidden: s.hidden, sortKey: s.sortKey, sortDir: s.sortDir, pageSize: s.pageSize, page: s.page, search: s.search,
      }),
    },
  ),
);

/** Header labels — literal keys so extraction sees them. */
export function consoleColumnLabel(t: TFunction, key: ConsoleColumnKey): string {
  switch (key) {
    case 'id': return t('Id');
    case 'thumbnail': return t('Thumbnail');
    case 'name': return t('Name');
    case 'manufacturer': return t('Manufacturer');
    case 'model': return t('Model');
    case 'function': return t('Function');
    case 'server': return t('Server');
    case 'source': return t('Source');
    case 'storage': return t('Storage');
    case 'events': return t('Events');
    case 'hour': return t('Hour');
    case 'day': return t('Day');
    case 'week': return t('Week');
    case 'month': return t('Month');
    case 'archived': return t('Archived');
    case 'zones': return t('Zones');
    case 'sequence': return t('Sequence');
  }
}
