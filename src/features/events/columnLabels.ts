import { useTranslation } from 'react-i18next';
import type { EventsColumnKey } from '@/stores/eventsColumns';

/**
 * Display labels for the events-list columns. Built inside a hook so `t()`
 * sees literal keys (the extractor can't follow a value pulled out of the
 * store's `EVENTS_COLUMNS` table).
 */
export function useEventsColumnLabels(): Record<EventsColumnKey, string> {
  const { t } = useTranslation();
  return {
    id: t('Id'),
    monitor: t('Monitor'),
    name: t('Name'),
    cause: t('Cause'),
    time: t('Start Time'),
    end: t('End Time'),
    duration: t('Duration'),
    frames: t('Frames'),
    alarm_frames: t('Alarm Frames'),
    tot_score: t('Total Score'),
    avg_score: t('Avg. Score'),
    max_score: t('Max. Score'),
    tags: t('Tags'),
    storage: t('Storage'),
    disk_space: t('DiskSpace'),
    archived: t('Archived'),
    emailed: t('Emailed'),
  };
}
