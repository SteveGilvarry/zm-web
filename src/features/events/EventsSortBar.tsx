import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { EVENT_SORT_FIELDS, type EventSortField, type SortDirection } from '@/api/events';
import { useSortFieldLabels } from './sortColumns';

/**
 * Server-side sort controls for layouts without a table header (the card
 * list). One button per backend sort field; the active one shows the
 * direction and flips it on click, like a column header would.
 */
export function EventsSortBar({
  sortField, sortDir, onToggle,
}: {
  sortField: EventSortField;
  sortDir: SortDirection;
  onToggle: (field: EventSortField) => void;
}) {
  const { t } = useTranslation();
  const labels = useSortFieldLabels();
  return (
    <div
      role="group"
      aria-label={t('Sort events')}
      className="flex flex-wrap items-center gap-1 text-xs"
    >
      <span className="me-1 text-fg-dim">{t('Sort')}</span>
      {EVENT_SORT_FIELDS.map((field) => {
        const active = field === sortField;
        return (
          <button
            key={field}
            type="button"
            onClick={() => onToggle(field)}
            aria-pressed={active}
            aria-label={
              active
                ? t('{{field}}, sorted {{direction}}', {
                    field: labels[field],
                    direction: sortDir === 'asc' ? t('ascending') : t('descending'),
                  })
                : t('Sort by {{field}}', { field: labels[field] })
            }
            className={clsx(
              'inline-flex items-center gap-1 px-2 py-1 rounded border transition-colors',
              active
                ? 'border-accent/50 bg-accent/12 text-accent'
                : 'border-border-subtle bg-surface text-fg-muted hover:text-fg hover:border-border',
            )}
          >
            {labels[field]}
            {active && (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
          </button>
        );
      })}
    </div>
  );
}
