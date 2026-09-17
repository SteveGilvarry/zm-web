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
 * `getZMVersionHTML` (functions.php:1055-1090), minus the reminder dropdown:
 * a database behind the code is an error you must fix before using
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
