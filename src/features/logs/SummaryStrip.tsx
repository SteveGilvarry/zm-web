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
      className="flex flex-wrap items-center gap-3 mb-1"
    >
      <SummaryCard
        label={t('Errors')}
        count={summary.errors}
        active={activeLevel === 'error'}
        onClick={onPickErrors}
        tone="crimson"
      />
      <SummaryCard
        label={t('Warnings')}
        count={summary.warnings}
        active={activeLevel === 'warning'}
        onClick={onPickWarnings}
        tone="amber"
      />
      <SummaryCard
        label={t('Info')}
        count={summary.info}
        active={activeLevel === 'info'}
        onClick={onPickInfo}
        tone="cyan"
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
      <span className="text-[11px] text-text-muted font-mono ms-auto">
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
  tone: 'crimson' | 'amber' | 'cyan' | 'muted';
}) {
  const { t } = useTranslation();
  const toneColor =
    tone === 'crimson' ? 'text-crimson border-crimson/40'
    : tone === 'amber' ? 'text-amber border-amber/40'
    : tone === 'cyan'  ? 'text-cyan border-cyan/40'
    :                    'text-text-secondary border-text-muted/40';
  return (
    <button
      onClick={onClick}
      aria-label={t('{{label}}: {{count}}', { label, count })}
      aria-pressed={active}
      className={clsx(
        'flex items-baseline gap-2 px-3 py-1.5 rounded-md bg-surface border transition-colors',
        active ? toneColor : 'border-border-subtle text-text-secondary hover:border-cyan/40',
      )}
    >
      <span className="text-[10px] font-mono uppercase tracking-[0.18em]">{label}</span>
      <span className="font-mono text-sm font-semibold">{count}</span>
    </button>
  );
}
