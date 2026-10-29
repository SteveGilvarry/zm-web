import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { useDateTimeFormat } from '@/features/config/useDateTimeFormat';
import { useLoggedInUsers } from '@/features/auth/useLoggedInUsers';

interface AccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  username: string | null;
  /** System View: lists the other signed-in sessions. */
  canViewSystem: boolean;
  onChangePassword: () => void;
  onLogout: () => void;
}

/**
 * The modern shell's account sheet: who is signed in, and for System
 * viewers the other PHP-UI sessions legacy's logout modal lists (decoded
 * from the Sessions table; API logins are tokens and never appear). Plain
 * table per DESIGN.md.
 */
export function AccountDialog({
  isOpen, onClose, username, canViewSystem, onChangePassword, onLogout,
}: AccountDialogProps) {
  const { t } = useTranslation();
  const { formatDateTime } = useDateTimeFormat();
  const { users, isLoading } = useLoggedInUsers(isOpen && canViewSystem);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('Account')}>
      <div className="space-y-4 text-sm">
        <p className="text-fg">
          {username ? t('Signed in as {{username}}', { username }) : t('You are not logged in.')}
        </p>
        {canViewSystem && (
          <section aria-labelledby="account-sessions-heading">
            <h3 id="account-sessions-heading" className="mb-1 font-medium text-fg">{t('Other logged in users')}</h3>
            {users.length === 0 ? (
              <p className="text-fg-dim">{isLoading ? t('Loading…') : t('No other sessions.')}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-start text-fg-dim">
                    <th scope="col" className="py-1 pe-3 text-start font-medium">{t('Username')}</th>
                    <th scope="col" className="py-1 pe-3 text-start font-medium">{t('IP Address')}</th>
                    <th scope="col" className="py-1 text-start font-medium">{t('Last Access')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={`${u.username}-${u.access}-${i}`} className="border-b border-border-subtle last:border-0">
                      <td className="py-1 pe-3 text-fg">
                        {u.userId != null
                          ? <Link to="/settings/users" search={{ uid: u.userId }} className="underline-offset-2 hover:underline">{u.username}</Link>
                          : u.username}
                      </td>
                      <td className="py-1 pe-3 font-mono tabular-nums text-fg">{u.remoteAddr}</td>
                      <td className="py-1 font-mono tabular-nums text-fg-dim">{formatDateTime(new Date(u.access * 1000))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
        <div className="flex justify-end gap-2 border-t border-border-subtle pt-3">
          <Button variant="ghost" size="sm" onClick={onChangePassword}>{t('Change password')}</Button>
          <Button variant="ghost" size="sm" onClick={onLogout}>{t('Log out')}</Button>
          <Button variant="secondary" size="sm" onClick={onClose}>{t('Close')}</Button>
        </div>
      </div>
    </Modal>
  );
}
