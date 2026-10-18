import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RunStateChooser } from '@/features/state/RunStateChooser';
import { useRunState } from '@/features/state/useRunState';
import { classicButtonClass } from '@/skins/classic/components/buttonClass';

/**
 * Legacy `getStatusBtnHTML`: System Edit gets a plain grey `btn-default`
 * reading the active state's name (or Running / Stopped) that opens the
 * state modal; System View only gets the same text as `navbar-text`.
 */
export function ClassicStatusButton({ canChange }: { canChange: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { running, label, busy } = useRunState();

  if (!canChange) {
    return <span className="text-sm text-classic-nav-link" data-testid="classic-run-state">{label}</span>;
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        className={classicButtonClass('default', 'sm')}
        aria-label={t('Run state: {{state}}. Change run state', { state: label })}
        aria-haspopup="dialog"
      >
        {label}
      </button>
      <RunStateChooser isOpen={open} onClose={() => setOpen(false)} running={running} />
    </>
  );
}
