import { useTranslation } from 'react-i18next';

import { useStatsColumnLabels } from '@/features/events/columnLabels';
import { STATS_COLUMNS, type StatsRow } from '@/features/events/statsTable';

/**
 * Legacy `getStatsTableHTML` (`skins/classic/includes/functions.php:1738`):
 * a small borderless table, caption `Stats - <eid> - <fid>`, every column
 * centred, and one full-width row when the frame has no stats. The stats
 * page and the frames table's "+" row both render it.
 */
export function ClassicStatsTable({
  eventId, frameId, rows, isLoading, testId = 'stats-table',
}: {
  eventId: number;
  frameId: number | null;
  rows: StatsRow[];
  isLoading?: boolean;
  testId?: string;
}) {
  const { t } = useTranslation();
  const labels = useStatsColumnLabels();
  return (
    <table data-testid={testId} className="mx-auto text-sm text-zinc-800 border-collapse">
      <caption className="caption-top text-start text-zinc-600 pb-1">
        {t('Stats')} - {eventId} - {frameId ?? ''}
      </caption>
      <thead>
        <tr>
          {STATS_COLUMNS.map((key) => (
            <th key={key} scope="col" className="px-2 py-1 font-bold text-center whitespace-nowrap">
              {labels[key]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length > 0 ? rows.map((row) => (
          <tr key={row.id} data-testid={`stats-row-${row.zoneId}`}>
            {STATS_COLUMNS.map((key) => (
              <td key={key} className="px-2 py-0.5 text-center tabular-nums whitespace-nowrap">
                {row[key]}
              </td>
            ))}
          </tr>
        )) : (
          <tr>
            <td colSpan={STATS_COLUMNS.length} className="px-2 py-1 text-center text-zinc-600">
              {isLoading ? t('Loading…') : t('There are no statistics recorded for this event/frame')}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
