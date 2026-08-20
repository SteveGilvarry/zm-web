import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Trans, useTranslation } from 'react-i18next';
import { Info, Loader2, Shield } from 'lucide-react';

import { Modal } from '@/components/common/Modal';
import { PermissionMatrix } from '@/features/users/PermissionMatrix';
import { buildTopLevelRows } from '@/features/users/permissions';
import { USER_FIELDS_ISSUE_URL, useAccountForm } from '@/features/users/useAccountForm';
import { useGroupPermissions } from '@/features/users/useGroupPermissions';
import { useMonitorPermissions } from '@/features/users/useMonitorPermissions';
import type { User } from '@/types';
import { PermPill } from './PermPill';

type EditorTab = 'account' | 'global' | 'groups' | 'monitors';

interface UserEditorProps {
  editing: User | null;
  onClose: () => void;
}

/**
 * Create / edit dialog. Mount it only while open, keyed on the user being
 * edited, so the tab resets to Account whenever it opens or switches user.
 */
export function UserEditor({ editing, onClose }: UserEditorProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<EditorTab>('account');
  const tabs: ReadonlyArray<readonly [EditorTab, string]> = [
    ['account', t('Account')],
    ['global', t('Global Permissions')],
    ['groups', t('Groups')],
    ['monitors', t('Monitors')],
  ];

  return (
    <Modal isOpen onClose={onClose} title={editing ? t('Edit {{name}}', { name: editing.username }) : t('Add User')}>
      <div className="-mx-5 -my-5">
        {/* Tabs (only meaningful when editing — create form is account-only). */}
        {editing && (
          <div className="flex items-center gap-1 px-5 pt-1 border-b border-border-subtle">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={clsx(
                  'px-3 py-2 text-sm border-b-2 -mb-px transition-colors',
                  tab === key
                    ? 'border-cyan text-cyan'
                    : 'border-transparent text-text-muted hover:text-text-primary',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="p-5">
          {tab === 'account' && (
            <AccountForm
              editing={editing}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: ['users'] });
                onClose();
              }}
              onCancel={onClose}
            />
          )}
          {tab === 'global' && editing && <GlobalPermissionsView user={editing} />}
          {tab === 'groups' && editing && <GroupPermissionsTab userId={editing.id} />}
          {tab === 'monitors' && editing && <MonitorPermissionsTab user={editing} />}
        </div>
      </div>
    </Modal>
  );
}

/* ----- Account tab ------------------------------------------------------ */

interface AccountFormProps {
  editing: User | null;
  onSaved: () => void;
  onCancel: () => void;
}

function AccountForm({ editing, onSaved, onCancel }: AccountFormProps) {
  const { t } = useTranslation();
  const { formData, setField, toggleEnabled, error, isSaving, submitDisabled, submit, isLocked } =
    useAccountForm(editing, onSaved);
  const lockedCls = 'opacity-60 cursor-not-allowed';
  const lockedTitle = t('Not editable on this zm_api build — see zm-api#23');

  return (
    <div className="space-y-4">
      {editing && (
        <div
          role="note"
          className="flex items-start gap-2 text-xs text-text-muted bg-panel border border-border-subtle rounded p-3"
        >
          <Info size={14} className="mt-0.5 shrink-0 text-amber" />
          <p className="leading-relaxed">
            <Trans>
              This zm_api build only saves <strong>Email</strong> and <strong>Enabled</strong> on an
              existing user. Password, name, phone and permission levels are disabled until{' '}
              <a href={USER_FIELDS_ISSUE_URL} target="_blank" rel="noreferrer" className="text-cyan underline">
                zm-api#23
              </a>{' '}
              lands; per-group and per-monitor grids still save.
            </Trans>
          </p>
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1.5">{t('Username')}</label>
        <input
          type="text"
          value={formData.username}
          onChange={(e) => setField('username', e.target.value)}
          disabled={!!editing}
          className={clsx(
            'w-full px-3 py-2 bg-panel border border-border-subtle rounded-lg',
            'text-text-primary text-sm focus:outline-none focus:border-cyan/50 transition-colors',
            editing && 'opacity-60 cursor-not-allowed',
          )}
          placeholder={t('username')}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            {t('Password')}
          </label>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => setField('password', e.target.value)}
            autoComplete="new-password"
            disabled={isLocked('password')}
            title={isLocked('password') ? lockedTitle : undefined}
            aria-describedby={isLocked('password') ? 'user-fields-locked' : undefined}
            className={clsx(
              'w-full px-3 py-2 bg-panel border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:border-cyan/50 transition-colors',
              isLocked('password') && lockedCls,
            )}
            placeholder={editing ? t('Not editable yet') : t('Password')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            {t('Confirm Password')}
          </label>
          <input
            type="password"
            value={formData.confirmPassword}
            onChange={(e) => setField('confirmPassword', e.target.value)}
            autoComplete="new-password"
            disabled={isLocked('password')}
            title={isLocked('password') ? lockedTitle : undefined}
            className={clsx(
              'w-full px-3 py-2 bg-panel border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:border-cyan/50 transition-colors',
              isLocked('password') && lockedCls,
            )}
            placeholder={t('Confirm password')}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">{t('Full Name')}</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setField('name', e.target.value)}
            disabled={isLocked('name')}
            title={isLocked('name') ? lockedTitle : undefined}
            className={clsx(
              'w-full px-3 py-2 bg-panel border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:border-cyan/50 transition-colors',
              isLocked('name') && lockedCls,
            )}
            placeholder={t('Full name')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">{t('Email')}</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setField('email', e.target.value)}
            className="w-full px-3 py-2 bg-panel border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:border-cyan/50 transition-colors"
            placeholder="user@example.com"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">{t('Phone')}</label>
          <input
            type="tel"
            value={formData.phone || ''}
            onChange={(e) => setField('phone', e.target.value)}
            disabled={isLocked('phone')}
            title={isLocked('phone') ? lockedTitle : undefined}
            className={clsx(
              'w-full px-3 py-2 bg-panel border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:border-cyan/50 transition-colors',
              isLocked('phone') && lockedCls,
            )}
            placeholder={t('Phone')}
          />
        </div>
        <div className="flex items-end">
          <div className="flex items-center justify-between w-full pb-2">
            <label className="text-sm font-medium text-text-secondary">{t('Enabled')}</label>
            <button
              onClick={toggleEnabled}
              role="switch"
              aria-checked={formData.enabled === 1}
              aria-label={t('Enabled')}
              className={clsx(
                'relative w-10 h-5 rounded-full transition-colors',
                formData.enabled === 1 ? 'bg-cyan' : 'bg-border',
              )}
            >
              <span
                className={clsx(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  formData.enabled === 1 ? 'start-5.5' : 'start-0.5',
                )}
              />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-xs text-crimson bg-crimson/10 border border-crimson/20 rounded p-2">
          {error}
        </div>
      )}

      {!editing && (
        <p className="text-[11px] text-text-muted leading-relaxed">
          {t('New users are created with default permissions. After saving, re-open the user to set Global / Group / Monitor permissions.')}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-panel border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
        >
          {t('Cancel')}
        </button>
        <button
          onClick={submit}
          disabled={submitDisabled}
          className={clsx(
            'px-4 py-2 rounded-lg text-sm font-medium bg-cyan text-void hover:bg-cyan/80 transition-colors flex items-center gap-2',
            submitDisabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          {isSaving && <Loader2 size={14} className="animate-spin" />}
          {editing ? t('Save Changes') : t('Create User')}
        </button>
      </div>
    </div>
  );
}

/* ----- Global permissions (read-only) ----------------------------------- */

function GlobalPermissionsView({ user }: { user: User }) {
  const rows = useMemo(() => buildTopLevelRows(user), [user]);
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-xs text-text-muted bg-panel border border-border-subtle rounded p-3">
        <Info size={14} className="mt-0.5 shrink-0 text-cyan" />
        <p className="leading-relaxed">
          <Trans>
            Top-level permissions are <strong>read-only</strong> here — the backend
            (<code>CreateUserRequest</code> / <code>UpdateUserRequest</code>) does not yet accept
            these fields (<a href={USER_FIELDS_ISSUE_URL} target="_blank" rel="noreferrer" className="text-cyan underline">zm-api#23</a>).
            Use the <em>Groups</em> and <em>Monitors</em> tabs for per-resource
            overrides, which persist via the dedicated permission endpoints.
          </Trans>
        </p>
      </div>
      <PermissionMatrix rows={rows} readOnly />
    </div>
  );
}

/* ----- Group permissions tab -------------------------------------------- */

function GroupPermissionsTab({ userId }: { userId: number }) {
  const { t } = useTranslation();
  const { isLoading, hasGroups, rows, setLevel } = useGroupPermissions(userId);

  if (isLoading) {
    return <div className="p-4 text-sm text-text-muted">{t('Loading…')}</div>;
  }
  if (!hasGroups) {
    return (
      <div className="p-4 text-sm text-text-muted">
        <Trans>
          No groups defined. Create groups under <code>/groups</code> first.
        </Trans>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        <Shield size={12} className="inline -mt-0.5 me-1" />
        <Trans>
          Per-group overrides. <strong>Inherit</strong> falls through to the global Monitors level.
        </Trans>
      </p>
      <div className="max-h-[420px] overflow-auto">
        <PermissionMatrix rows={rows} rowHeader={t('Group')} onChange={setLevel} />
      </div>
    </div>
  );
}

/* ----- Monitor permissions tab ------------------------------------------ */

/**
 * Per-monitor permission tab with a simple windowed scroll for installs
 * with 50+ monitors. We render the full table inside a fixed-height
 * scrollable container — the only optimisation is that the heavy
 * effective-permission computation is memoised once per dataset.
 */
function MonitorPermissionsTab({ user }: { user: User }) {
  const { t } = useTranslation();
  const { isLoading, hasMonitors, rows, setLevel } = useMonitorPermissions(user);

  // Simple windowing: render full table, but inside a height-capped
  // scrollable region. For installs >100 monitors this still scales OK
  // because each row is a plain table row. For >500 we'd swap to
  // virtualisation but the OpenAPI page_size cap is 1000 anyway.
  const scrollRef = useRef<HTMLDivElement>(null);

  if (isLoading) {
    return <div className="p-4 text-sm text-text-muted">{t('Loading…')}</div>;
  }
  if (!hasMonitors) {
    return <div className="p-4 text-sm text-text-muted">{t('No monitors.')}</div>;
  }

  const matrixRows = rows.map(({ effective, ...row }) => ({
    ...row,
    trailing: <PermPill value={effective} />,
  }));

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        <Shield size={12} className="inline -mt-0.5 me-1" />
        <Trans>
          Per-monitor overrides. The <strong>Effective</strong> column shows the level after
          combining global Monitors → group → monitor.
        </Trans>
      </p>
      <div ref={scrollRef} className="max-h-[420px] overflow-auto border border-border-subtle rounded">
        <PermissionMatrix
          rows={matrixRows}
          rowHeader={t('Monitor')}
          trailingHeader={t('Effective')}
          onChange={setLevel}
        />
      </div>
    </div>
  );
}
