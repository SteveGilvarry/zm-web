/**
 * One-time rename of the browser-stored preference keys.
 *
 * The project was called `zm-dashboard` until 2026-08-22, and its
 * localStorage keys carried that name. Renaming the project without moving
 * the keys would silently reset every operator's log columns, page size and
 * dismissed hints — the kind of small loss that looks like a bug.
 *
 * Each entry moves old → new if the new key is not already set. Safe to run
 * on every boot: once the old key is gone it does nothing.
 */
const RENAMES: ReadonlyArray<readonly [from: string, to: string]> = [
  ['zm-dashboard.logs.columns', 'zm-web.logs.columns'],
  ['zm-dashboard.logs.pageSize', 'zm-web.logs.pageSize'],
  ['zmdash:skinHintDismissed', 'zm-web:skinHintDismissed'],
];

export function migrateLegacyPreferences(storage: Storage | undefined = safeStorage()): void {
  if (!storage) return;
  for (const [from, to] of RENAMES) {
    try {
      const value = storage.getItem(from);
      if (value === null) continue;
      // A value under the new key wins: this browser has already moved on.
      if (storage.getItem(to) === null) storage.setItem(to, value);
      storage.removeItem(from);
    } catch {
      // Private-window quota errors and disabled storage are not worth
      // failing a boot over; the preference just stays where it was.
      return;
    }
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
