import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { Modal } from '@/components/common/Modal';
import { usePerms } from '@/features/auth/usePerms';
import { useGroupsPage } from '@/features/groups/useGroupsPage';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { ClassicButton, ClassicTable, classicLink, classicTd, classicTh } from '../components/settings/primitives';
import { ClassicGroupModal } from '../components/ClassicGroupModal';

/**
 * Groups — classic skin. Legacy `?view=groups`: Mark / Name / Monitors,
 * the name reading "Id Name" and indented by depth, New and Delete in the
 * toolbar, and membership edited in the modal's `MonitorIds[]` multi-select
 * rather than a side panel. Without Groups edit, New and Delete stay on the
 * toolbar greyed, as legacy renders them.
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
          <div className="flex items-center gap-2">
            <ClassicButton tone="primary" onClick={s.openCreate} disabled={!canEdit}>{t('New')}</ClassicButton>
            <ClassicButton tone="danger" onClick={s.deleteMarked} disabled={!canEdit || s.marked.size === 0}>
              {t('Delete')}
            </ClassicButton>
          </div>

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

      <ClassicGroupModal
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

      {/* Legacy `getDelConfirmModal('ConfirmDeleteGroups', 'Delete')`. */}
      <Modal isOpen={s.deleteConfirmOpen} onClose={s.cancelDeleteMarked} title={t('Delete')}>
        <p className="text-sm text-zinc-800">{t('Are you sure you wish to delete the selected groups?')}</p>
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-zinc-200">
          <ClassicButton onClick={s.cancelDeleteMarked}>{t('Cancel')}</ClassicButton>
          <ClassicButton tone="danger" onClick={s.confirmDeleteMarked}>{t('Delete')}</ClassicButton>
        </div>
      </Modal>
    </AppShell>
  );
}
