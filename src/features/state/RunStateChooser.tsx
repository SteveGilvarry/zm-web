import { useEffect } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { isDaemonAction, useRunStateChooser } from './useRunStateChooser';

interface RunStateChooserProps {
  isOpen: boolean;
  onClose: () => void;
  /** Current supervisor state, to pick a sensible default choice. */
  running: boolean | null;
}

/**
 * Legacy-style run-state modal: choose Start / Stop / Restart or a saved
 * state, Apply, confirm. Opened from the header RUNNING badge.
 */
export function RunStateChooser({ isOpen, onClose, running }: RunStateChooserProps) {
  const { t } = useTranslation();
  const c = useRunStateChooser(isOpen);

  // Close once the action lands so the badge can show the new status.
  useEffect(() => {
    if (c.succeeded) {
      c.reset();
      onClose();
    }
  }, [c, onClose]);

  const close = () => {
    c.reset();
    onClose();
  };

  const choiceLabel = (choice: string) =>
    choice === 'start' ? t('Start')
      : choice === 'stop' ? t('Stop')
        : choice === 'restart' ? t('Restart')
          : choice;

  const confirmTitle = () => {
    const ch = c.choice.toLowerCase();
    if (ch === 'start') return t('Start ZoneMinder');
    if (ch === 'stop') return t('Stop ZoneMinder');
    if (ch === 'restart') return t('Restart ZoneMinder');
    return t('Apply run state');
  };

  const confirmMessage = () => {
    const ch = c.choice.toLowerCase();
    if (ch === 'stop') return t('Stop ZoneMinder? Recording will halt across every monitor.');
    if (ch === 'restart') return t('Restart ZoneMinder? Capture streams will reconnect after a short outage.');
    if (ch === 'start') return t('Start ZoneMinder? Capture and analysis daemons will launch for every enabled monitor.');
    return t('Apply state "{{name}}"? Every monitor\'s Capturing / Analysing / Recording mode will be overwritten and affected daemons restarted.', { name: c.choice });
  };

  return (
    <>
      <Modal isOpen={isOpen && !c.confirming} onClose={close} title={t('Run State')}>
        <div className="space-y-4">
          <p className="text-xs text-text-muted">
            {running === false
              ? t('ZoneMinder is stopped. Start it, or apply a saved state to start it with that configuration.')
              : t('Change the run state: stop or restart the daemons, or apply a saved state to every monitor.')}
          </p>
          <label className="block text-sm font-medium text-text-secondary">
            {t('New state')}
            <select
              value={c.choice}
              onChange={(e) => c.setChoice(e.target.value)}
              className="mt-1.5 w-full px-3 py-2 bg-panel border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:border-cyan/50"
            >
              <option value="">{t('Choose…')}</option>
              <optgroup label={t('Daemons')}>
                <option value="start">{t('Start')}</option>
                <option value="stop">{t('Stop')}</option>
                <option value="restart">{t('Restart')}</option>
              </optgroup>
              {c.states.length > 0 && (
                <optgroup label={t('Saved states')}>
                  {c.states.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.is_active === 1 ? t('{{name}} (active)', { name: s.name }) : s.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          {c.statesLoading && (
            <p className="text-[11px] text-text-muted flex items-center gap-1">
              <Loader2 size={11} className="animate-spin" />
              {t('Loading states…')}
            </p>
          )}
          {c.error && (
            <p role="alert" className="text-xs text-crimson">
              {t('Failed: {{message}}', { message: c.error.message })}
            </p>
          )}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={close}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-panel border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
            >
              {t('Cancel')}
            </button>
            <button
              type="button"
              onClick={c.requestApply}
              disabled={!c.choice || c.pending}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium bg-cyan text-void hover:bg-cyan/80 transition-colors flex items-center gap-2',
                (!c.choice || c.pending) && 'opacity-50 cursor-not-allowed',
              )}
            >
              {c.pending && <Loader2 size={14} className="animate-spin" />}
              {t('Apply')}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={isOpen && c.confirming}
        onClose={c.cancelConfirm}
        onConfirm={c.confirmApply}
        title={confirmTitle()}
        message={confirmMessage()}
        confirmText={isDaemonAction(c.choice) ? choiceLabel(c.choice.toLowerCase()) : t('Apply')}
        variant={c.choice.toLowerCase() === 'stop' ? 'danger' : 'warning'}
        isLoading={c.pending}
      />
    </>
  );
}
