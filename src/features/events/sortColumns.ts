import { useTranslation } from 'react-i18next';
import type { EventSortField } from '@/api/events';
import type { EventsColumnKey } from '@/stores/eventsColumns';

/**
 * Which table columns the backend can sort by. Name, Cause, Monitor, Frames,
 * Tags and DiskSpace are not in `EventSortField`, so their headers are inert.
 */
export const COLUMN_SORT_FIELD: Partial<Record<EventsColumnKey, EventSortField>> = {
  id: 'id',
  time: 'start_time',
  end: 'end_time',
  duration: 'length',
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
  };
}
