import { useTranslation } from 'react-i18next';
import type { LogColumnKey } from './csv';
import { ALL_LOG_COLUMNS } from './columns';

export interface ColumnPickerProps {
  visible: LogColumnKey[];
  onChange: (cols: LogColumnKey[]) => void;
  onClose: () => void;
}

/** Display labels per column. Literal `t()` calls so extraction sees them. */
function useLogColumnLabels(): Record<LogColumnKey, string> {
  const { t } = useTranslation();
  return {
    timestamp: t('Timestamp'),
    level: t('Level'),
    component: t('Component'),
    server: t('Server'),
    pid: t('PID'),
    file: t('File'),
    line: t('Line'),
    message: t('Message'),
  };
}

/**
 * Floating checkbox menu the toolbar pops open. Anchored absolutely
 * against the toolbar button by its parent.
 *
 * Rule: at least one column must stay visible — toggling the last
 * remaining column off is a no-op so the table doesn't render with
 * zero columns and look broken.
 */
export function ColumnPicker({ visible, onChange, onClose }: ColumnPickerProps) {
  const { t } = useTranslation();
  const labels = useLogColumnLabels();
  const toggle = (key: LogColumnKey) => {
    if (visible.includes(key)) {
      const next = visible.filter((k) => k !== key);
      if (next.length === 0) return;
      onChange(next);
    } else {
      // Re-add in the canonical column order so the table stays predictable.
      onChange(ALL_LOG_COLUMNS.filter((k) => visible.includes(k) || k === key));
    }
  };
  return (
    <>
      {/* Click-outside scrim */}
      <div
        className="fixed inset-0 z-10"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="menu"
        aria-label={t('Toggle columns')}
        className="absolute end-0 top-full mt-1 z-20 min-w-[160px] p-1 rounded bg-surface border border-border shadow-[var(--elevation-2)]"
      >
        {ALL_LOG_COLUMNS.map((key) => (
          <label
            key={key}
            className="flex items-center gap-2 px-2 py-1 text-xs text-fg-muted hover:text-fg cursor-pointer"
          >
            <input
              type="checkbox"
              checked={visible.includes(key)}
              onChange={() => toggle(key)}
              aria-label={t('Toggle {{column}} column', { column: labels[key] })}
            />
            {labels[key]}
          </label>
        ))}
      </div>
    </>
  );
}
