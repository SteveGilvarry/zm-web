import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Modal } from '@/components/common/Modal';
import { useZmConfig } from '@/features/config/useZmConfig';
import { useLegacyDateTimeFormat } from '@/features/config/useLegacyDateTimeFormat';
import { useLoggedInUsers } from '@/features/auth/useLoggedInUsers';
import { ClassicButton } from '@/skins/classic/components';
import { classicLinkClass } from '@/skins/classic/components/Table';

interface ClassicLogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string | null;
  /** System View: shows the table of other sessions. */
  canViewSystem: boolean;
  onLogout: () => void;
  /** Own user page; shown as Config when `ZM_USER_SELF_EDIT` is on. */
  onConfig: () => void;
}

/**
 * Legacy's logout modal (`ajax/modals/logout.php`), opened from the
 * account-circle link in the navbar: "<title> Logout", the current login,
 * for System viewers a table of other logged-in PHP sessions (Username
 * linking to the user, IP Address, Last Access), then Logout, Config (only
 * with `ZM_USER_SELF_EDIT`) and Cancel.
 */
export function ClassicLogoutModal({
  isOpen, onClose, username, canViewSystem, onLogout, onConfig,
}: ClassicLogoutModalProps) {
  const { t } = useTranslation();
  const webTitle = useZmConfig('ZM_WEB_TITLE', 'ZoneMinder');
  const selfEdit = useZmConfig('ZM_USER_SELF_EDIT', false);
  const { formatDateTime } = useLegacyDateTimeFormat();
  const { users } = useLoggedInUsers(isOpen && canViewSystem);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${webTitle} ${t('Logout')}`}>
      <div className="text-sm text-zinc-800">
        <p>
          {username
            ? t("Current login is '{{username}}'", { username })
            : t('You are not logged in.')}
        </p>
        {canViewSystem && (
          <div className="mt-3">
            <p className="mb-1">{t('Other logged in users:')}</p>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-zinc-100">
                  <th scope="col" className="px-2 py-1 text-start font-semibold">{t('Username')}</th>
                  <th scope="col" className="px-2 py-1 text-start font-semibold">{t('IP Address')}</th>
                  <th scope="col" className="px-2 py-1 text-start font-semibold">{t('Last Access')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={`${u.username}-${u.access}-${i}`} className="odd:bg-white even:bg-zinc-50">
                    <td className="px-2 py-1">
                      {u.userId != null
                        ? <Link to="/settings/users" search={{ uid: u.userId }} className={classicLinkClass}>{u.username}</Link>
                        : u.username}
                    </td>
                    <td className="px-2 py-1">{u.remoteAddr}</td>
                    <td className="px-2 py-1">{formatDateTime(new Date(u.access * 1000))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2 border-t border-zinc-200 pt-3">
          <ClassicButton onClick={onLogout}>{t('Logout')}</ClassicButton>
          {selfEdit && <ClassicButton onClick={onConfig}>{t('Config')}</ClassicButton>}
          <ClassicButton onClick={onClose}>{t('Cancel')}</ClassicButton>
        </div>
      </div>
    </Modal>
  );
}
