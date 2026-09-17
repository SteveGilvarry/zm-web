import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import { GroupEditDialog } from '@/features/groups/GroupEditDialog';
import { useGroupsPage } from '@/features/groups/useGroupsPage';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { ClassicButton, ClassicTable, classicLink, classicTd, classicTh } from '../components/settings/primitives';

/**
 * Groups — classic skin. Legacy `?view=groups`: Mark / Name / Monitors,
 * the name reading "Id Name" and indented by depth, New and Delete in the
 * toolbar, and membership edited in the modal's `MonitorIds[]` multi-select
 * rather than a side panel.
 */
export default function ClassicGroupsPage() {
  const { t } = useTranslation();
  const s = useGroupsPage();
  const { can } = usePerms();
  useSiteTitle(t('Groups'));

  if (!s.isAuthenticated) return null;
  const { groups, monitors, tree, editing } = s;
  const canEdit = can('groups', 'Edit');

  return (
    <AppShell title={t('Groups')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <h1 className="text-xl text-zinc-800 font-semibold">{t('Groups')}</h1>

          <RequirePerm feature="groups" level="Edit">
            <div className="flex items-center gap-2">
              <ClassicButton tone="primary" onClick={s.openCreate}>{t('New')}</ClassicButton>
              <ClassicButton tone="danger" onClick={s.deleteMarked} disabled={s.marked.size === 0}>
                {t('Delete')}
              </ClassicButton>
            </div>
          </RequirePerm>

          <QueryState
            isLoading={s.isLoading}
            isError={s.isError}
            error={s.error}
            onRetry={s.refetch}
            empty={tree.length === 0}
            emptyMessage={t('No groups yet. Click "New" to create one.')}
          >
            <ClassicTable>
              <thead>
                <tr>
                  {canEdit && <th className={classicTh}>{t('Mark')}</th>}
                  <th className={classicTh}>{t('Name')}</th>
                  <th className={classicTh}>{t('Monitors')}</th>
                </tr>
              </thead>
              <tbody>
                {tree.map(({ group, depth }) => (
                  <tr key={group.id} data-depth={depth}>
                    {canEdit && (
                      <td className={classicTd}>
                        <input
                          type="checkbox"
                          checked={s.marked.has(group.id)}
                          onChange={() => s.toggleMark(group.id)}
                          aria-label={t('Mark {{name}}', { name: group.name })}
                        />
                      </td>
                    )}
                    <td className={classicTd} style={{ paddingInlineStart: `${0.75 + depth * 1.5}rem` }}>
                      {canEdit ? (
                        <button type="button" onClick={() => s.openEdit(group)} className={classicLink}>
                          {group.id} {group.name}
                        </button>
                      ) : group.name}
                    </td>
                    <td className={clsx(classicTd, 'text-zinc-600')}>{s.monitorNamesOf(group.id)}</td>
                  </tr>
                ))}
              </tbody>
            </ClassicTable>
          </QueryState>
        </div>
      </main>

      <GroupEditDialog
        open={s.dialogOpen}
        editing={editing}
        groups={groups}
        monitors={monitors}
        initialMonitorIds={editing ? s.monitorIdsOf(editing.id) : []}
        onClose={s.closeDialog}
        onSubmit={s.handleSubmit}
        pending={s.dialogPending}
        error={s.dialogError}
      />
    </AppShell>
  );
}
