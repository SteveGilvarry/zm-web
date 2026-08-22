import { useTranslation } from 'react-i18next';
import type { FilterAttr, FilterOp, FilterSortField } from '@/api/filters';

/** Translated attribute labels (legacy `Filter::attrTypes()` wording). */
export function useFilterAttrLabels(): Record<FilterAttr, string> {
  const { t } = useTranslation();
  return {
    AlarmFrames:        t('Alarm Frames'),
    AlarmedZoneId:      t('Alarmed Zone'),
    Archived:           t('Archive Status'),
    AvgScore:           t('Avg. Score'),
    Cause:              t('Cause'),
    DiskBlocks:         t('Disk Blocks'),
    DiskPercent:        t('Disk Percent'),
    DiskSpace:          t('Event Disk Space'),
    CurrentDateTime:    t('Current DateTime'),
    CurrentDate:        t('Current Date'),
    CurrentTime:        t('Current Time'),
    CurrentWeekday:     t('Current Weekday'),
    DateTime:           t('Date Time'),
    Emailed:            t('Emailed'),
    EndDateTime:        t('End Date/Time'),
    EndDate:            t('End Date'),
    EndTime:            t('End Time'),
    EndWeekday:         t('End Weekday'),
    ExistsInFileSystem: t('Exists In File System'),
    FilterServerId:     t('Server Filter is Running On'),
    Frames:             t('Frames'),
    Group:              t('Group'),
    Id:                 t('Id'),
    Length:             t('Duration'),
    MaxScore:           t('Max. Score'),
    Monitor:            t('Monitor'),
    MonitorId:          t('Monitor Id'),
    MonitorName:        t('Monitor Name'),
    MonitorServerId:    t('Server Monitor is Running On'),
    Name:               t('Name'),
    Notes:              t('Notes'),
    SecondaryStorageId: t('Secondary Storage Area'),
    ServerId:           t('Server Id'),
    StartDateTime:      t('Start Date/Time'),
    StartDate:          t('Start Date'),
    StartTime:          t('Start Time'),
    StartWeekday:       t('Start Weekday'),
    StateId:            t('Run State'),
    StorageId:          t('Storage Area'),
    StorageServerId:    t('Server Hosting Storage'),
    SystemLoad:         t('System Load'),
    Tags:               t('Tags'),
    TotScore:           t('Total Score'),
  };
}

/** Translated operator descriptions (legacy `Filter::opTypes()` wording). */
export function useFilterOpLabels(): Record<FilterOp, string> {
  const { t } = useTranslation();
  return {
    '=':        t('equal to'),
    '!=':       t('not equal to'),
    '>=':       t('greater than or equal to'),
    '>':        t('greater than'),
    '<':        t('less than'),
    '<=':       t('less than or equal to'),
    '=~':       t('matches (regex)'),
    '!~':       t('does not match (regex)'),
    '=[]':      t('in set'),
    '![]':      t('not in set'),
    'IS':       t('is'),
    'IS NOT':   t('is not'),
    'LIKE':     t('contains'),
    'NOT LIKE': t('does not contain'),
  };
}

/** Translated sort-field labels (legacy `$sort_fields`). */
export function useFilterSortFieldLabels(): Record<FilterSortField, string> {
  const { t } = useTranslation();
  return {
    '':            t('None'),
    Id:            t('Id'),
    Name:          t('Name'),
    Cause:         t('Cause'),
    Tags:          t('Tags'),
    DiskSpace:     t('Event Disk Space'),
    Notes:         t('Notes'),
    MonitorName:   t('Monitor Name'),
    StartDateTime: t('Start Date/Time'),
    EndDateTime:   t('End Date/Time'),
    Length:        t('Duration'),
    Frames:        t('Frames'),
    AlarmFrames:   t('Alarm Frames'),
    TotScore:      t('Total Score'),
    AvgScore:      t('Avg. Score'),
    MaxScore:      t('Max. Score'),
  };
}

/** Monday-first weekday labels, index = MySQL WEEKDAY(). */
export function useWeekdayLabels(): string[] {
  const { t } = useTranslation();
  return [t('Mon'), t('Tue'), t('Wed'), t('Thu'), t('Fri'), t('Sat'), t('Sun')];
}
