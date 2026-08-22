import type { ZmEvent } from '@/types';
import { eventsToCsv } from '@/features/events/eventsCsv';
import type { EventsColumnKey } from '@/stores/eventsColumns';

/** Legacy "Export Matches": the listed events as CSV with the standard columns. */
export const MATCH_COLUMNS: EventsColumnKey[] = [
  'id', 'name', 'monitor', 'cause', 'time', 'end', 'duration', 'frames', 'alarm_frames',
  'tot_score', 'avg_score', 'max_score', 'archived', 'storage', 'disk_space', 'tags',
];

export function matchesToCsv(
  events: ZmEvent[],
  monitorName: (id: number) => string,
  storageName: (id: number) => string,
): string {
  return eventsToCsv(events, MATCH_COLUMNS, { monitorName, storageName });
}
