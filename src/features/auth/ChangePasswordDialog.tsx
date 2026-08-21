import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { TextField } from '@/components/common/TextField';
import { useChangePassword } from './useChangePassword';

interface ChangePasswordDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Change-your-own-password dialog, shared by both skins — it is the same
 * three fields either way, and the primitives it uses already render to
 * skin. Opened from the user menu, and from the Users page when an admin is
 * editing their own account.
 */
export function ChangePasswordDialog({ isOpen, onClose }: ChangePasswordDialogProps) {
  const { t } = useTranslation();
  const pw = useChangePassword(onClose);
  const problem = pw.validationError ?? pw.submitError;

  const close = () => {
    pw.reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title={t('Change password')}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          pw.submit();
        }}
      >
        <TextField
          label={t('Current password')}
          type="password"
          autoComplete="current-password"
          value={pw.form.current}
          onChange={(e) => pw.setField('current', e.target.value)}
        />
        <TextField
          label={t('New password')}
          type="password"
          autoComplete="new-password"
          value={pw.form.next}
          onChange={(e) => pw.setField('next', e.target.value)}
        />
        <TextField
          label={t('Confirm new password')}
          type="password"
          autoComplete="new-password"
          value={pw.form.confirm}
          onChange={(e) => pw.setField('confirm', e.target.value)}
        />
        {problem && (
          <p role="alert" className="text-label text-danger">
            {problem}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={close}>{t('Cancel')}</Button>
          <Button type="submit" variant="primary" disabled={!pw.canSubmit}>
            {pw.isSaving ? t('Saving…') : t('Change password')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
