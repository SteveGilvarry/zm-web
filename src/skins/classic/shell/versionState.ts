import { compareVersions } from '@/features/settings/updateNotice';
import type { StatTone } from './statTone';

export interface VersionStateInput {
  /** `ZM_VERSION` — the running code, from `/host/getVersion`. */
  version: string | undefined;
  /** `ZM_DYN_DB_VERSION` — the schema the database is at. */
  dbVersion?: string;
  /** `ZM_DYN_LAST_VERSION` — newest release the updater has seen. */
  lastVersion?: string;
  /** `ZM_CHECK_FOR_UPDATES`. */
  checkForUpdates: boolean;
  /** `ZM_DYN_NEXT_REMINDER`, unix seconds; 0 when unset. */
  nextReminder?: number;
  /** Unix seconds. */
  now?: number;
}

export type VersionStatus = 'db-upgrade' | 'current' | 'update-available';

/**
 * `getZMVersionHTML` (functions.php:1055-1090); the reminder dropdown is
 * `VersionReminder.tsx`. A database behind the code is an error you must fix before using
 * ZoneMinder; a newer release with reminders due is a warning; anything else
 * is plain.
 */
export function versionState(input: VersionStateInput): { tone: StatTone; status: VersionStatus } {
  const { version, dbVersion, lastVersion, checkForUpdates } = input;
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (dbVersion && version && dbVersion !== version) {
    return { tone: 'danger', status: 'db-upgrade' };
  }
  const outOfDate = !!lastVersion && !!version && compareVersions(lastVersion, version) > 0;
  if (!outOfDate || !checkForUpdates || (input.nextReminder ?? 0) > now) {
    return { tone: 'normal', status: 'current' };
  }
  return { tone: 'warn', status: 'update-available' };
}

export type ReminderOption = 'ignore' | 'hour' | 'day' | 'week' | 'month' | 'never';

const SECONDS: Partial<Record<ReminderOption, number>> = {
  hour: 60 * 60,
  day: 24 * 60 * 60,
  week: 7 * 24 * 60 * 60,
  // Legacy's `case` list leaves 'month' out, so the item does nothing there;
  // its own arithmetic says 30 days, which is what it plainly meant.
  month: 30 * 24 * 60 * 60,
};

/**
 * The config row each menu item writes (includes/actions/version.php):
 * Ignore copies `ZM_DYN_LAST_VERSION` into `ZM_DYN_CURR_VERSION`, the
 * reminders push `ZM_DYN_NEXT_REMINDER` out, Never turns
 * `ZM_CHECK_FOR_UPDATES` off.
 */
export function reminderWrite(
  option: ReminderOption,
  lastVersion: string,
  nowSeconds: number,
): { name: string; value: string } {
  if (option === 'ignore') return { name: 'ZM_DYN_CURR_VERSION', value: lastVersion };
  if (option === 'never') return { name: 'ZM_CHECK_FOR_UPDATES', value: '0' };
  return { name: 'ZM_DYN_NEXT_REMINDER', value: String(nowSeconds + (SECONDS[option] ?? 0)) };
}
