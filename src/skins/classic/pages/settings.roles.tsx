import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

import { AppShell } from '@/skins/AppShell';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { useRolesPage, type RoleSortKey } from '@/features/roles/useRolesPage';
import { ROLE_TABLE_COLUMNS, rolePermLabel } from '@/features/roles/roleFields';
import { useOptionsTabs } from '@/features/settings/useOptionsTabs';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { OptionsRail } from '../components/settings/OptionsRail';
import {
  ClassicButton, ClassicSortTh, ClassicTable, ClassicToolbar, classicLink, classicTd, classicTh,
} from '../components/settings/primitives';

/**
 * Options → Roles, classic skin (`_options_roles.php`): [Add New Role]
 * [Delete] over a table of Mark, Name, Description, the eight permission
 * levels as plain text, and how many users hold each role.
 */
export default function ClassicSettingsRolesPage() {
  const { t } = useTranslation();
  const r = useRolesPage();
  const tabs = useOptionsTabs();
  useSiteTitle(t('Roles'));

  if (!r.isAuthenticated) return null;

  const sortTh = (key: RoleSortKey, label: string) => (
    <ClassicSortTh key={key} active={r.sortKey === key} dir={r.sortDir} onClick={() => r.sortBy(key)}>
      {label}
    </ClassicSortTh>
  );

  return (
    <AppShell title={t('Roles')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <h1 className="text-xl text-zinc-800 font-semibold">{t('Options')}</h1>
          <div className="flex items-start gap-4">
            <OptionsRail tabs={tabs} active="roles" />
            <div className="flex-1 min-w-0 space-y-3">
              <RequirePerm feature="system" level="View" fallback="message">
                <ClassicToolbar
                  end={
                    <>
                      <ClassicButton onClick={() => r.exportRoles('csv')}>{t('Export CSV')}</ClassicButton>
                      <ClassicButton onClick={() => r.exportRoles('json')}>{t('Export JSON')}</ClassicButton>
                    </>
                  }
                >
                  <ClassicButton tone="primary" disabled={!r.canEdit} onClick={r.openNew}>
                    {t('Add New Role')}
                  </ClassicButton>
                  <ClassicButton
                    tone="danger"
                    disabled={!r.canEdit || r.selectedRoles.length === 0}
                    onClick={r.requestDelete}
                  >
                    {t('Delete')}
                  </ClassicButton>
                </ClassicToolbar>

                <QueryState
                  isLoading={r.isLoading}
                  isError={r.isError}
                  error={r.error}
                  onRetry={r.refetch}
                  empty={r.roles.length === 0}
                  emptyMessage={t('No matching records found')}
                >
                  <ClassicTable>
                    <thead>
                      <tr>
                        <th className={clsx(classicTh, 'w-8')}>
                          <input
                            type="checkbox"
                            aria-label={t('Select all')}
                            checked={r.allSelected}
                            disabled={!r.canEdit}
                            onChange={r.toggleAll}
                          />
                        </th>
                        {sortTh('name', t('Name'))}
                        {sortTh('description', t('Description'))}
                        {ROLE_TABLE_COLUMNS.map((k) => sortTh(k, rolePermLabel(t, k)))}
                        {sortTh('users', t('Users'))}
                      </tr>
                    </thead>
                    <tbody>
                      {r.roles.map((role) => (
                        <tr key={role.id}>
                          <td className={classicTd}>
                            <input
                              type="checkbox"
                              aria-label={t('Mark {{name}}', { name: role.name })}
                              checked={r.selectedIds.has(role.id)}
                              disabled={!r.canEdit}
                              onChange={() => r.toggleSelected(role.id)}
                            />
                          </td>
                          <td className={classicTd}>
                            {r.canEdit ? (
                              <Link to="/settings/roles/$roleId" params={{ roleId: String(role.id) }} className={classicLink}>
                                {role.name}
                              </Link>
                            ) : role.name}
                          </td>
                          <td className={classicTd}>{role.description}</td>
                          {ROLE_TABLE_COLUMNS.map((k) => (
                            <td key={k} className={clsx(classicTd, 'text-xs')}>{role[k]}</td>
                          ))}
                          <td className={clsx(classicTd, 'tabular-nums')}>{r.userCount(role.id)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </ClassicTable>
                </QueryState>
              </RequirePerm>
            </div>
          </div>
        </div>
      </main>

      <ConfirmDialog
        isOpen={r.confirmOpen}
        onClose={r.cancelDelete}
        onConfirm={r.confirmDelete}
        title={t('Delete Role')}
        message={t('Delete {{count}} role? Users holding it keep their own permissions.', { count: r.selectedRoles.length })}
        confirmText={t('Delete')}
        variant="danger"
        isLoading={r.isDeleting}
      />
    </AppShell>
  );
}
