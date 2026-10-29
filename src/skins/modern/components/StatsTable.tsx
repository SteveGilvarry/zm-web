import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';

import { useStatsColumnLabels } from '@/features/events/columnLabels';
import { STATS_COLUMNS, type StatsColumnKey, type StatsRow } from '@/features/events/statsTable';

/** Text columns; everything else is a number and lines up on the end edge. */
const TEXT_COLUMNS: ReadonlySet<StatsColumnKey> = new Set(['zoneName']);

/**
 * One frame's per-zone motion stats — the stats page, and the detail row a
 * frames-table row opens. Numbers in monospace, one row per zone.
 */
export function StatsTable({
  rows, isLoading, testId = 'stats-table', className,
}: {
  rows: StatsRow[];
  isLoading?: boolean;
  testId?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const labels = useStatsColumnLabels();
  return (
    <div className={clsx('overflow-x-auto rounded border border-border-subtle bg-surface', className)}>
      <table data-testid={testId} className="w-full text-sm">
        <thead className="border-b border-border-subtle">
          <tr>
            {STATS_COLUMNS.map((key) => (
              <th
                key={key}
                scope="col"
                className={clsx(
                  'px-3 py-2 text-xs font-medium text-fg-dim whitespace-nowrap',
                  TEXT_COLUMNS.has(key) ? 'text-start' : 'text-end',
                )}
              >
                {labels[key]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? rows.map((row) => (
            <tr key={row.id} data-testid={`stats-row-${row.zoneId}`} className="border-b border-border-subtle last:border-0">
              {STATS_COLUMNS.map((key) => (
                <td
                  key={key}
                  className={clsx(
                    'px-3 py-1 whitespace-nowrap',
                    TEXT_COLUMNS.has(key) ? 'text-fg' : 'text-end font-mono tabular-nums text-fg-muted',
                  )}
                >
                  {row[key]}
                </td>
              ))}
            </tr>
          )) : (
            <tr>
              <td colSpan={STATS_COLUMNS.length} className="px-3 py-3 text-center text-xs text-fg-dim">
                {isLoading ? t('Loading…') : t('There are no statistics recorded for this event/frame')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
