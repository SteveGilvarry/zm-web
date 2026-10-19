import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Download, Plus, Trash2 } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { useRolesPage, type RoleSortKey } from '@/features/roles/useRolesPage';
import { ROLE_TABLE_COLUMNS, rolePermLabel } from '@/features/roles/roleFields';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { PermPill } from '../components/settings/PermPill';

const th = 'px-3 py-2 text-start text-xs font-medium text-fg-dim whitespace-nowrap';

/**
 * Settings → Roles, modern skin: one bordered table of named permission
 * sets. The levels are pills because a level is state (docs/DESIGN.md).
 */
export default function SettingsRolesPage() {
  const { t } = useTranslation();
  const r = useRolesPage();
  useSiteTitle(t('Roles'));

  if (!r.isAuthenticated) return null;

  const sortHeader = (key: RoleSortKey, label: string) => (
    <th
      key={key}
      className={th}
      aria-sort={r.sortKey === key ? (r.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" onClick={() => r.sortBy(key)} className="hover:text-fg">
        {label}
      </button>
    </th>
  );

  return (
    <AppShell title={t('Roles')}>
      <main className="flex-1 p-6 overflow-auto">
        <RequirePerm feature="system" level="View" fallback="message">
          <div className="mx-auto w-full max-w-[1400px] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-fg">{t('Roles')}</h2>
                <p className="text-xs text-fg-dim">
                  {t('A user holding a role gets, per feature, the higher of their own level and the role’s.')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => r.exportRoles('csv')}>
                  <Download size={13} aria-hidden />
                  {t('Export CSV')}
                </Button>
                {r.canEdit && (
                  <>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={r.requestDelete}
                      disabled={r.selectedRoles.length === 0}
                    >
                      <Trash2 size={13} aria-hidden />
                      {t('Delete selected ({{count}})', { count: r.selectedRoles.length })}
                    </Button>
                    <Button size="sm" variant="primary" onClick={r.openNew}>
                      <Plus size={14} aria-hidden />
                      {t('Add Role')}
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="rounded border border-border-subtle overflow-hidden">
              <QueryState
                isLoading={r.isLoading}
                isError={r.isError}
                error={r.error}
                onRetry={r.refetch}
                empty={r.roles.length === 0}
                emptyMessage={t('No roles yet. Users get only their own permissions.')}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border-subtle">
                        {r.canEdit && (
                          <th className="px-3 py-2 w-8">
                            <input type="checkbox" aria-label={t('Select all')} checked={r.allSelected} onChange={r.toggleAll} />
                          </th>
                        )}
                        {sortHeader('name', t('Name'))}
                        {sortHeader('description', t('Description'))}
                        {ROLE_TABLE_COLUMNS.map((k) => sortHeader(k, rolePermLabel(t, k)))}
                        {sortHeader('users', t('Users'))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {r.roles.map((role) => (
                        <tr key={role.id} className="hover:bg-surface-2 transition-colors">
                          {r.canEdit && (
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                aria-label={t('Mark {{name}}', { name: role.name })}
                                checked={r.selectedIds.has(role.id)}
                                onChange={() => r.toggleSelected(role.id)}
                              />
                            </td>
                          )}
                          <td className="px-3 py-2 font-medium text-fg">
                            {r.canEdit ? (
                              <Link
                                to="/settings/roles/$roleId"
                                params={{ roleId: String(role.id) }}
                                className="hover:text-accent hover:underline"
                              >
                                {role.name}
                              </Link>
                            ) : role.name}
                          </td>
                          <td className="px-3 py-2 text-fg-muted">{role.description}</td>
                          {ROLE_TABLE_COLUMNS.map((k) => (
                            <td key={k} className="px-3 py-2"><PermPill value={role[k]} /></td>
                          ))}
                          <td className={clsx('px-3 py-2 font-mono text-xs tabular-nums text-fg-muted')}>{r.userCount(role.id)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </QueryState>
            </div>
          </div>
        </RequirePerm>
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
