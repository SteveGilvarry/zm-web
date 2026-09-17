import { useTranslation } from 'react-i18next';
import type { EventsColumnKey } from '@/stores/eventsColumns';
import type { FramesColumnKey } from './framesTable';

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
    notes: t('Notes'),
  };
}

/** The same, for the frames table (legacy `views/frames.php`). */
export function useFramesColumnLabels(): Record<FramesColumnKey, string> {
  const { t } = useTranslation();
  return {
    event_id: t('Event Id'),
    frame_id: t('Frame Id'),
    type: t('Type'),
    time_stamp: t('Time Stamp'),
    delta: t('Time Delta'),
    score: t('Score'),
    thumbnail: t('Thumbnail'),
  };
}
