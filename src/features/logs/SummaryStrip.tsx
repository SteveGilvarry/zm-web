import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

/**
 * Compact 3-card summary above the logs table. Each card is a button
 * that filters the table to a level bucket; click an already-active
 * card again to drop the filter (caller handles that contract).
 */
export interface LogsSummary {
  errors: number;
  warnings: number;
  info: number;
}

export interface SummaryStripProps {
  summary: LogsSummary;
  total: number;
  shownCount: number;
  page: number;
  pageSize: number;
  /** Which legacy level bucket is currently active, if any (-1 errors, 0 warnings, 1 info). */
  activeLevel: number | undefined;
  onPickErrors: () => void;
  onPickWarnings: () => void;
  onPickInfo: () => void;
}

export function SummaryStrip({
  summary, total, shownCount, page, pageSize,
  activeLevel, onPickErrors, onPickWarnings, onPickInfo,
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
        active={activeLevel === -1}
        onClick={onPickErrors}
        tone="crimson"
      />
      <SummaryCard
        label={t('Warnings')}
        count={summary.warnings}
        active={activeLevel === 0}
        onClick={onPickWarnings}
        tone="amber"
      />
      <SummaryCard
        label={t('Info')}
        count={summary.info}
        active={activeLevel === 1}
        onClick={onPickInfo}
        tone="cyan"
      />
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
  tone: 'crimson' | 'amber' | 'cyan';
}) {
  const { t } = useTranslation();
  const toneColor =
    tone === 'crimson' ? 'text-crimson border-crimson/40'
    : tone === 'amber' ? 'text-amber border-amber/40'
    :                    'text-cyan border-cyan/40';
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
