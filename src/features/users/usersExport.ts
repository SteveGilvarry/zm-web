import type { User } from '@/types';

/** Columns in legacy list order (`?view=options&tab=users` export). */
export const USER_EXPORT_COLUMNS = [
  'id', 'username', 'name', 'email', 'enabled',
  'stream', 'events', 'control', 'monitors', 'groups', 'devices', 'snapshots', 'system',
] as const satisfies readonly (keyof User)[];

function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  // Neutralise spreadsheet formula injection before quoting.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function usersToCsv(users: readonly User[]): string {
  const head = USER_EXPORT_COLUMNS.join(',');
  const rows = users.map((u) => USER_EXPORT_COLUMNS.map((k) => csvCell(u[k])).join(','));
  return [head, ...rows].join('\r\n') + '\r\n';
}

export function usersToJson(users: readonly User[]): string {
  return JSON.stringify(
    users.map((u) => Object.fromEntries(USER_EXPORT_COLUMNS.map((k) => [k, u[k] ?? null]))),
    null,
    2,
  );
}

/** Save text as a download. Separate so tests can stub it. */
export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportUsers(users: readonly User[], format: 'csv' | 'json'): void {
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'csv') downloadText(`users-${stamp}.csv`, usersToCsv(users), 'text/csv;charset=utf-8');
  else downloadText(`users-${stamp}.json`, usersToJson(users), 'application/json');
}
