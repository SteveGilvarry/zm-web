import { useEffect } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { buttonClasses, fieldClasses } from '@/components/common/styles';
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
        <div className="space-y-3">
          <p className="text-label text-fg-dim">
            {running === false
              ? t('ZoneMinder is stopped. Start it, or apply a saved state to start it with that configuration.')
              : t('Change the run state: stop or restart the daemons, or apply a saved state to every monitor.')}
          </p>
          <label className="block text-label text-fg-dim">
            {t('New state')}
            <select
              value={c.choice}
              onChange={(e) => c.setChoice(e.target.value)}
              className={clsx('mt-1 text-fg', fieldClasses('md'))}
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
            <p className="text-label text-fg-dim flex items-center gap-1">
              <Loader2 size={11} className="animate-spin" />
              {t('Loading states…')}
            </p>
          )}
          {c.error && (
            <p role="alert" className="text-label text-danger">
              {t('Failed: {{message}}', { message: c.error.message })}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={close}
              className={buttonClasses('secondary', 'md')}
            >
              {t('Cancel')}
            </button>
            <button
              type="button"
              onClick={c.requestApply}
              disabled={!c.choice || c.pending}
              className={clsx(
                buttonClasses('primary', 'md'),
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
