import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import type { LogMinLevel } from '@/api/logs';

/**
 * Compact summary above the logs table, counting the rows on screen by
 * ZoneMinder severity (errors = ERR and worse, then WAR, INF, DBG). Each
 * card is a button that sets the severity threshold to that level *or
 * worse*; click an active card again to drop it (caller handles that
 * contract).
 */
export interface LogsSummary {
  errors: number;
  warnings: number;
  info: number;
  debug: number;
}

export interface SummaryStripProps {
  summary: LogsSummary;
  total: number;
  shownCount: number;
  page: number;
  pageSize: number;
  /** Active severity threshold, if any — matches the API's `min_level`. */
  activeLevel: LogMinLevel | undefined;
  onPickErrors: () => void;
  onPickWarnings: () => void;
  onPickInfo: () => void;
  onPickDebug?: () => void;
}

export function SummaryStrip({
  summary, total, shownCount, page, pageSize,
  activeLevel, onPickErrors, onPickWarnings, onPickInfo, onPickDebug,
}: SummaryStripProps) {
  const { t } = useTranslation();
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last  = total === 0 ? 0 : (page - 1) * pageSize + shownCount;
  return (
    <div
      role="region"
      aria-label={t('Logs summary')}
      className="flex flex-wrap items-center gap-2 mb-1"
    >
      <SummaryCard
        label={t('Errors')}
        count={summary.errors}
        active={activeLevel === 'error'}
        onClick={onPickErrors}
        tone="danger"
      />
      <SummaryCard
        label={t('Warnings')}
        count={summary.warnings}
        active={activeLevel === 'warning'}
        onClick={onPickWarnings}
        tone="warn"
      />
      <SummaryCard
        label={t('Info')}
        count={summary.info}
        active={activeLevel === 'info'}
        onClick={onPickInfo}
        tone="info"
      />
      {onPickDebug && (
        <SummaryCard
          label={t('Debug')}
          count={summary.debug}
          active={activeLevel === 'debug'}
          onClick={onPickDebug}
          tone="muted"
        />
      )}
      <span className="ms-auto font-mono tabular-nums text-xs text-fg-dim">
        {t('Total: {{total}} · Displaying: {{first}}–{{last}}', { total, first, last })}
      </span>
    </div>
  );
}

function SummaryCard({
  label, count, active, onClick, tone,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone: 'danger' | 'warn' | 'info' | 'muted';
}) {
  const { t } = useTranslation();
  // Colour marks a state worth acting on — errors and warnings that actually
  // happened. Zero of either, and the info / debug tallies, stay neutral; the
  // accent is left to say which threshold is currently applied.
  const countTone =
    count > 0 && tone === 'danger' ? 'text-danger'
      : count > 0 && tone === 'warn' ? 'text-warn'
        : 'text-fg';
  return (
    <button
      onClick={onClick}
      aria-label={t('{{label}}: {{count}}', { label, count })}
      aria-pressed={active}
      className={clsx(
        'flex items-baseline gap-2 px-2 py-1 rounded border transition-colors',
        active
          ? 'border-accent bg-accent/12'
          : 'border-border-subtle bg-surface hover:border-border',
      )}
    >
      <span className="text-xs text-fg-dim">{label}</span>
      <span className={clsx('font-mono tabular-nums text-sm font-medium', countTone)}>{count}</span>
    </button>
  );
}
