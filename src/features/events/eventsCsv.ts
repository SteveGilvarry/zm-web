import type { ZmEvent } from '@/types';
import { EVENTS_COLUMNS, type EventsColumnKey } from '@/stores/eventsColumns';
import { escapeCsvField } from '@/features/logs/csv';
import { formatDurationHms } from './duration';

export interface EventsCsvLookups {
  monitorName: (monitorId: number) => string;
  storageName: (storageId: number) => string;
}

/** One cell of the legacy bootstrap-table CSV export, by column key. */
export function eventCsvField(e: ZmEvent, key: EventsColumnKey, lookups: EventsCsvLookups): string | number {
  switch (key) {
    case 'id': return e.id;
    case 'name': return e.name;
    case 'archived': return e.archived === 1 ? 'Yes' : 'No';
    case 'emailed': return e.emailed === 1 ? 'Yes' : 'No';
    case 'monitor': return lookups.monitorName(e.monitor_id);
    case 'cause': return e.cause ?? '';
    case 'tags': return (e.tags ?? []).map((t) => t.name).join(' ');
    case 'time': return e.start_date_time ?? '';
    case 'end': return e.end_date_time ?? '';
    case 'duration': return formatDurationHms(e.length);
    case 'frames': return e.frames ?? 0;
    case 'alarm_frames': return e.alarm_frames ?? 0;
    case 'tot_score': return e.tot_score ?? 0;
    case 'avg_score': return e.avg_score ?? 0;
    case 'max_score': return e.max_score ?? 0;
    case 'storage': return lookups.storageName(e.storage_id);
    case 'disk_space': return e.disk_space ?? 0;
  }
}

/**
 * The visible page as CSV (legacy bootstrap-table "Export → CSV"). Header
 * uses the English column labels so the file is stable across UI languages.
 */
export function eventsToCsv(events: ZmEvent[], columns: EventsColumnKey[], lookups: EventsCsvLookups): string {
  const labelOf = (k: EventsColumnKey) => EVENTS_COLUMNS.find((c) => c.key === k)?.label ?? k;
  const header = columns.map((c) => escapeCsvField(labelOf(c))).join(',');
  const rows = events.map((e) => columns.map((c) => escapeCsvField(eventCsvField(e, c, lookups))).join(','));
  return [header, ...rows].join('\n');
}
