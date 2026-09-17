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
 * Legacy `?view=state` modal (`web/ajax/modals/state.php`): a Change State
 * select holding Start / Stop / Restart plus every saved state, a New State
 * box, and Apply / Save / Delete. Opened from the header RUNNING badge.
 */
export function RunStateChooser({ isOpen, onClose, running }: RunStateChooserProps) {
  const { t } = useTranslation();
  const c = useRunStateChooser(isOpen);

  // Close once the action lands so the badge can show the new status. Save
  // and Delete stay put — legacy leaves the modal up for those.
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
      <Modal isOpen={isOpen && c.confirming === null} onClose={close} title={t('Run State')}>
        <div className="space-y-3">
          <p className="text-label text-fg-dim">
            {running === false
              ? t('ZoneMinder is stopped. Start it, or apply a saved state to start it with that configuration.')
              : t('Change the run state: stop or restart the daemons, or apply a saved state to every monitor.')}
          </p>
          <label className="block text-label text-fg-dim">
            {t('Change State')}
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
          <label className="block text-label text-fg-dim">
            {t('New State')}
            <input
              type="text"
              value={c.newName}
              onChange={(e) => c.setNewName(e.target.value)}
              className={clsx('mt-1 text-fg', fieldClasses('md'))}
            />
          </label>
          <p className="text-label text-fg-faint">
            {t('Save stores every monitor\'s current Capturing / Analysing / Recording mode under that name.')}
          </p>
          {c.statesLoading && (
            <p className="text-label text-fg-dim flex items-center gap-1">
              <Loader2 size={11} className="animate-spin" />
              {t('Loading states…')}
            </p>
          )}
          {c.saved && (
            <p role="status" className="text-label text-ok">
              {t('State saved.')}
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
              onClick={c.requestDelete}
              disabled={!c.canDelete || c.deleting}
              className={buttonClasses('danger', 'md')}
            >
              {c.deleting && <Loader2 size={14} className="animate-spin" />}
              {t('Delete')}
            </button>
            <button
              type="button"
              onClick={c.save}
              disabled={!c.canSave || c.saving}
              className={buttonClasses('secondary', 'md')}
            >
              {c.saving && <Loader2 size={14} className="animate-spin" />}
              {t('Save')}
            </button>
            <button
              type="button"
              onClick={c.requestApply}
              disabled={!c.choice || c.pending}
              className={buttonClasses('primary', 'md')}
            >
              {c.pending && <Loader2 size={14} className="animate-spin" />}
              {t('Apply')}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={isOpen && c.confirming === 'apply'}
        onClose={c.cancelConfirm}
        onConfirm={c.confirmApply}
        title={confirmTitle()}
        message={confirmMessage()}
        confirmText={isDaemonAction(c.choice) ? choiceLabel(c.choice.toLowerCase()) : t('Apply')}
        variant={c.choice.toLowerCase() === 'stop' ? 'danger' : 'warning'}
        isLoading={c.pending}
      />

      <ConfirmDialog
        isOpen={isOpen && c.confirming === 'delete'}
        onClose={c.cancelConfirm}
        onConfirm={c.confirmDelete}
        title={t('Delete run state')}
        message={t('Delete the saved state "{{name}}"? The monitors it describes are not changed.', { name: c.choice })}
        confirmText={t('Delete')}
        variant="danger"
        isLoading={c.deleting}
      />
    </>
  );
}
