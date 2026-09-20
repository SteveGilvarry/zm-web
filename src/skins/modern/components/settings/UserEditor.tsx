import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Trans, useTranslation } from 'react-i18next';
import { Info, Loader2, Shield } from 'lucide-react';

import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { Select } from '@/components/common/Select';
import { TextField } from '@/components/common/TextField';
import { fieldClasses, LABEL } from '@/components/common/styles';
import { PermissionMatrix } from '@/features/users/PermissionMatrix';
import { USERNAME_PATTERN_SOURCE, useAccountForm, type HomeView } from '@/features/users/useAccountForm';
import { useGlobalPermissions } from '@/features/users/useGlobalPermissions';
import { useGroupPermissions } from '@/features/users/useGroupPermissions';
import { useMonitorPermissions } from '@/features/users/useMonitorPermissions';
import type { User } from '@/types';
import { PermPill } from './PermPill';

type EditorTab = 'account' | 'global' | 'groups' | 'monitors';

/** An informational note, so it stays neutral. */
const NOTE = 'flex items-start gap-2 rounded border border-border-subtle bg-surface-2 p-3 text-xs text-fg-muted';

interface UserEditorProps {
  editing: User | null;
  onClose: () => void;
  /**
   * `self`: the signed-in user editing their own row under
   * `ZM_USER_SELF_EDIT` without System Edit — password, language and home
   * view only, as legacy `actions/user.php` saves.
   */
  mode?: 'admin' | 'self';
  /** Present when the row being edited is the signed-in operator's own:
   *  closes this dialog and opens the self-service password form. */
  onChangePassword?: () => void;
}

/**
 * Create / edit dialog. Mount it only while open, keyed on the user being
 * edited, so the tab resets to Account whenever it opens or switches user.
 */
export function UserEditor({ editing, onClose, mode = 'admin', onChangePassword }: UserEditorProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<EditorTab>('account');
  const selfEdit = mode === 'self';
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
        {editing && !selfEdit && (
          <div className="flex items-center gap-1 px-5 pt-1 border-b border-border-subtle">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={clsx(
                  'px-3 py-2 text-sm border-b-2 -mb-px transition-colors',
                  tab === key
                    ? 'border-accent text-accent'
                    : 'border-transparent text-fg-dim hover:text-fg',
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
              selfEdit={selfEdit}
              onChangePassword={onChangePassword}
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
  selfEdit?: boolean;
  onChangePassword?: () => void;
}

function AccountForm({ editing, onSaved, onCancel, selfEdit = false, onChangePassword }: AccountFormProps) {
  const { t } = useTranslation();
  const {
    formData, setField, toggleEnabled, toggleApiEnabled, error, usernameError, isSaving, submitDisabled, submit,
    canChange, languages, homeViews,
  } = useAccountForm(editing, onSaved, { selfEdit });
  const lockedCls = 'opacity-60 cursor-not-allowed';
  const adminOnly = t('Only an administrator can change this');
  const homeViewLabel: Record<HomeView, string> = {
    console: t('Console'),
    events: t('Events'),
    map: t('Map'),
    montage: t('Montage'),
    montagereview: t('Montage Review'),
    watch: t('Watch'),
  };
  /** Props for a text field an admin may edit but a self-editor may only see (legacy shows them). */
  const lockable = (field: 'name' | 'email' | 'phone') =>
    canChange(field)
      ? {}
      : { disabled: true, title: adminOnly, className: lockedCls };

  return (
    <div className="space-y-4">
      {editing && selfEdit && (
        <div role="note" className={NOTE}>
          <Info size={14} className="mt-0.5 shrink-0 text-fg-dim" aria-hidden />
          <p className="leading-relaxed">
            {t('You are editing your own account: your password, language and home view. Everything else is set by an administrator.')}
          </p>
        </div>
      )}

      {/* Not a `TextField`: the pattern message has to announce itself, and
          the primitive's error line carries no live role. */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="user-username" className={LABEL}>{t('Username')}</label>
        <input
          id="user-username"
          type="text"
          value={formData.username}
          onChange={(e) => setField('username', e.target.value)}
          disabled={!canChange('username')}
          pattern={editing ? undefined : USERNAME_PATTERN_SOURCE}
          aria-invalid={!!usernameError}
          className={clsx(fieldClasses('md', !!usernameError), editing && lockedCls)}
          placeholder={t('username')}
        />
        {usernameError && <p role="alert" className="text-xs text-danger">{usernameError}</p>}
      </div>

      {onChangePassword ? (
        <div className="flex items-center justify-between gap-4 rounded border border-border-subtle bg-surface-2 p-3">
          <p className="text-xs text-fg-muted">
            {t('Your own password is changed through the self-service form.')}
          </p>
          <Button onClick={onChangePassword}>{t('Change password')}</Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label={editing ? t('New Password') : t('Password')}
            type="password"
            value={formData.password}
            onChange={(e) => setField('password', e.target.value)}
            autoComplete="new-password"
            placeholder={editing ? t('Leave blank to keep') : t('Password')}
          />
          <TextField
            label={t('Confirm Password')}
            type="password"
            value={formData.confirmPassword}
            onChange={(e) => setField('confirmPassword', e.target.value)}
            autoComplete="new-password"
            placeholder={t('Confirm password')}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <TextField
          label={t('Full Name')}
          type="text"
          value={formData.name}
          onChange={(e) => setField('name', e.target.value)}
          placeholder={t('Full name')}
          {...lockable('name')}
        />
        <TextField
          label={t('Email')}
          type="email"
          value={formData.email}
          onChange={(e) => setField('email', e.target.value)}
          placeholder="user@example.com"
          {...lockable('email')}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TextField
          label={t('Phone')}
          type="tel"
          value={formData.phone || ''}
          onChange={(e) => setField('phone', e.target.value)}
          placeholder={t('Phone')}
          {...lockable('phone')}
        />
        <Select
          label={t('Language')}
          value={formData.language}
          onChange={(e) => setField('language', e.target.value)}
        >
          {languages.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Select
          label={t('Home View')}
          value={formData.homeView}
          onChange={(e) => setField('homeView', e.target.value)}
        >
          {homeViews.map((v) => <option key={v} value={v}>{homeViewLabel[v]}</option>)}
        </Select>
        {!selfEdit && (
          <div className="flex flex-col justify-end gap-3 pb-2">
            <Toggle label={t('Enabled')} checked={formData.enabled === 1} onToggle={toggleEnabled} />
            <Toggle label={t('API Enabled')} checked={formData.apiEnabled === 1} onToggle={toggleApiEnabled} />
          </div>
        )}
      </div>

      {error && (
        <div className="rounded border border-danger/30 bg-danger/10 p-2 text-xs text-danger">
          {error}
        </div>
      )}

      {!editing && (
        <p className="text-xs leading-relaxed text-fg-dim">
          {t('New users are created with default permissions. After saving, re-open the user to set Global / Group / Monitor permissions.')}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button onClick={onCancel}>{t('Cancel')}</Button>
        <Button variant="primary" onClick={submit} disabled={submitDisabled}>
          {isSaving && <Loader2 size={14} className="animate-spin" />}
          {editing ? t('Save Changes') : t('Create User')}
        </Button>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between w-full">
      <span className="text-sm text-fg-muted">{label}</span>
      <button
        onClick={onToggle}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={clsx('relative w-10 h-5 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-border')}
      >
        <span
          className={clsx(
            'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
            checked ? 'start-5.5' : 'start-0.5',
          )}
        />
      </button>
    </div>
  );
}

/* ----- Global permissions ----------------------------------------------- */

function GlobalPermissionsView({ user }: { user: User }) {
  const { t } = useTranslation();
  const { rows, setLevel } = useGlobalPermissions(user);
  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-muted">
        <Shield size={12} className="inline -mt-0.5 me-1" aria-hidden />
        {t('Each change saves as soon as it is made. Group and Monitor overrides on the other tabs refine the Monitors level.')}
      </p>
      <PermissionMatrix rows={rows} onChange={setLevel} />
    </div>
  );
}

/* ----- Group permissions tab -------------------------------------------- */

function GroupPermissionsTab({ userId }: { userId: number }) {
  const { t } = useTranslation();
  const { isLoading, hasGroups, rows, setLevel } = useGroupPermissions(userId);

  if (isLoading) {
    return <div className="p-4 text-sm text-fg-dim">{t('Loading…')}</div>;
  }
  if (!hasGroups) {
    return (
      <div className="p-4 text-sm text-fg-dim">
        <Trans>
          No groups defined. Create groups under <code>/groups</code> first.
        </Trans>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-muted">
        <Shield size={12} className="inline -mt-0.5 me-1" aria-hidden />
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
    return <div className="p-4 text-sm text-fg-dim">{t('Loading…')}</div>;
  }
  if (!hasMonitors) {
    return <div className="p-4 text-sm text-fg-dim">{t('No monitors.')}</div>;
  }

  const matrixRows = rows.map(({ effective, ...row }) => ({
    ...row,
    trailing: <PermPill value={effective} />,
  }));

  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-muted">
        <Shield size={12} className="inline -mt-0.5 me-1" aria-hidden />
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
