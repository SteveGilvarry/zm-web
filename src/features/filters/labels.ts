import { useTranslation } from 'react-i18next';
import type { FilterField, FilterOperator } from '@/api/filters';

export type FilterFieldKind = 'string' | 'number' | 'monitor' | 'bool' | 'date';

export interface FilterFieldMeta {
  value: FilterField;
  label: string;
  kind: FilterFieldKind;
}

/** Field menu for the rule builder. A hook so `t()` sees literal keys. */
export function useFilterFields(): FilterFieldMeta[] {
  const { t } = useTranslation();
  return [
    { value: 'monitor_id',      label: t('Monitor'),         kind: 'monitor' },
    { value: 'cause',           label: t('Cause'),           kind: 'string' },
    { value: 'archived',        label: t('Archived'),        kind: 'bool' },
    { value: 'name',            label: t('Name'),            kind: 'string' },
    { value: 'notes',           label: t('Notes'),           kind: 'string' },
    { value: 'max_score',       label: t('Max score'),       kind: 'number' },
    { value: 'avg_score',       label: t('Avg score'),       kind: 'number' },
    { value: 'tot_score',       label: t('Total score'),     kind: 'number' },
    { value: 'alarm_frames',    label: t('Alarm frames'),    kind: 'number' },
    { value: 'start_date_time', label: t('Start date/time'), kind: 'date' },
  ];
}

/**
 * Human-readable operator descriptions (shown as option tooltips). Mirrors
 * `FILTER_OPERATOR_LABELS` in `@/api/filters`, but translated.
 */
export function useFilterOperatorLabels(): Record<FilterOperator, string> {
  const { t } = useTranslation();
  return {
    '=':         t('equal to'),
    '!=':        t('not equal to'),
    '>':         t('greater than'),
    '>=':        t('greater than or equal to'),
    '<':         t('less than'),
    '<=':        t('less than or equal to'),
    '=~':        t('matches (regex)'),
    '!~':        t('does not match (regex)'),
    '=[]':       t('in set'),
    '![]':       t('not in set'),
    'IS':        t('is'),
    'IS NOT':    t('is not'),
    'LIKE':      t('like'),
    'NOT LIKE':  t('not like'),
    'contains':  t('contains'),
    'starts':    t('starts with'),
    'ends':      t('ends with'),
  };
}
