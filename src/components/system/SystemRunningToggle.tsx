import { useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Power, Loader2 } from 'lucide-react';
import { RunStateChooser } from '@/features/state/RunStateChooser';
import { useRunState } from '@/features/state/useRunState';

interface SystemRunningToggleProps {
  /** 'compact' (default) for header strips, 'banner' for full-row buttons. */
  variant?: 'compact' | 'banner';
  /**
   * System View without Edit: legacy prints the status as plain text
   * (`navbar-text`) instead of a button that opens the state modal.
   */
  readOnly?: boolean;
}

/**
 * The run-state badge in the modern header: the active saved state's name,
 * or Running / Stopped. Clicking it opens the run-state chooser (Start /
 * Stop / Restart / saved states), as the legacy button opened the state
 * modal; every action confirms before it runs. The classic skin has its
 * own grey button over the same `useRunState`.
 */
export function SystemRunningToggle({ variant = 'compact', readOnly = false }: SystemRunningToggleProps) {
  const { t } = useTranslation();
  const [chooserOpen, setChooserOpen] = useState(false);
  const { running, label, busy } = useRunState();
  const ariaLabel = t('Run state: {{state}}. Change run state', { state: label });

  if (readOnly) {
    return (
      <span
        className={clsx('text-xs', running ? 'text-ok' : running === false ? 'text-danger' : 'text-fg-muted')}
        aria-label={t('Run state: {{state}}', { state: label })}
      >
        {label}
      </span>
    );
  }

  const chooser = (
    <RunStateChooser isOpen={chooserOpen} onClose={() => setChooserOpen(false)} running={running} />
  );

  if (variant === 'banner') {
    return (
      <>
        <button
          onClick={() => setChooserOpen(true)}
          disabled={busy}
          className={clsx(
            'flex items-center gap-2 px-3 py-1.5 rounded text-sm border transition-colors',
            running
              ? 'border-ok/40 bg-ok/10 text-ok hover:bg-ok/20'
              : 'border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
            busy && 'opacity-70 cursor-wait',
          )}
          aria-label={ariaLabel}
          aria-haspopup="dialog"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
          {label}
        </button>
        {chooser}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setChooserOpen(true)}
        disabled={busy}
        className={clsx(
          'inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
          running
            ? 'border border-ok/40 bg-ok/15 text-ok hover:bg-ok/25'
            : 'border border-danger/40 bg-danger/15 text-danger hover:bg-danger/25',
          busy && 'opacity-70 cursor-wait',
        )}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
      >
        {busy
          ? <Loader2 size={11} className="animate-spin" />
          : <Power size={11} />}
        {label}
      </button>
      {chooser}
    </>
  );
}
