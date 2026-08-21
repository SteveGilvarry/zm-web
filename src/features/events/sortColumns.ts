import { useTranslation } from 'react-i18next';
import type { EventSortField } from '@/api/events';
import type { EventsColumnKey } from '@/stores/eventsColumns';

/**
 * Which table columns the backend can sort by. zm-api#20 added Name, Cause,
 * Monitor, Notes and Frames; Tags, Storage, DiskSpace, Archived and Emailed
 * have no `EventSortField`, so those headers stay inert. `monitor_id` sorts
 * by id, not by the monitor's name — the header still reads "Monitor".
 */
export const COLUMN_SORT_FIELD: Partial<Record<EventsColumnKey, EventSortField>> = {
  id: 'id',
  monitor: 'monitor_id',
  name: 'name',
  cause: 'cause',
  time: 'start_time',
  end: 'end_time',
  duration: 'length',
  frames: 'frames',
  alarm_frames: 'alarm_frames',
  tot_score: 'tot_score',
  avg_score: 'avg_score',
  max_score: 'max_score',
};

/** Labels for the sort bar / sort select, keyed by backend field. */
export function useSortFieldLabels(): Record<EventSortField, string> {
  const { t } = useTranslation();
  return {
    start_time: t('Start'),
    end_time: t('End'),
    id: t('ID'),
    length: t('Duration'),
    alarm_frames: t('Alarm frames'),
    tot_score: t('Total score'),
    avg_score: t('Avg score'),
    max_score: t('Max score'),
    name: t('Name'),
    cause: t('Cause'),
    monitor_id: t('Monitor'),
    notes: t('Notes'),
    frames: t('Frames'),
  };
}
