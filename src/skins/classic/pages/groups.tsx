import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import { GroupEditDialog } from '@/features/groups/GroupEditDialog';
import { useGroupsPage } from '@/features/groups/useGroupsPage';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { ClassicButton, ClassicTable, classicTd, classicTh } from '../components/settings/primitives';

/**
 * Groups — classic skin. Legacy `?view=groups`: an indented group table
 * with monitor counts, and a checkbox list of monitors for the selected
 * group in place of the legacy multi-select.
 */
export default function ClassicGroupsPage() {
  const { t } = useTranslation();
  const s = useGroupsPage();
  const { can } = usePerms();
  useSiteTitle(t('Groups'));

  if (!s.isAuthenticated) return null;
  const { groups, monitors, tree, effectiveSelected, memberIds, memberships } = s;
  const canEdit = can('groups', 'Edit');
  const parentName = (id: number | null | undefined) => groups.find((g) => g.id === id)?.name ?? '';

  return (
    <AppShell title={t('Groups')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl text-zinc-800 font-semibold">{t('Groups')}</h1>
            <RequirePerm feature="groups" level="Edit">
              <ClassicButton tone="primary" onClick={s.openCreate}>{t('New group')}</ClassicButton>
            </RequirePerm>
          </div>

          <div className="grid grid-cols-12 gap-4 items-start">
            <div className="col-span-12 lg:col-span-7">
              <QueryState
                isLoading={s.isLoading}
                isError={s.isError}
                error={s.error}
                onRetry={s.refetch}
                empty={tree.length === 0}
                emptyMessage={t('No groups yet. Click "New group" to create one.')}
              >
                <ClassicTable>
                  <thead>
                    <tr>
                      <th className={classicTh}>{t('Name')}</th>
                      <th className={classicTh}>{t('Parent')}</th>
                      <th className={clsx(classicTh, 'text-end')}>{t('Monitors')}</th>
                      <th className={clsx(classicTh, 'text-end')}>{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tree.map(({ group, depth }) => (
                      <tr
                        key={group.id}
                        data-depth={depth}
                        onClick={() => s.select(group.id)}
                        className={clsx('cursor-pointer', effectiveSelected?.id === group.id && '!bg-zinc-200')}
                      >
                        <td className={classicTd} style={{ paddingInlineStart: `${0.75 + depth * 1.25}rem` }}>
                          {depth > 0 && <span className="text-zinc-400 me-1">↳</span>}
                          {group.name}
                        </td>
                        <td className={clsx(classicTd, 'text-zinc-600')}>{parentName(group.parent_id) || '—'}</td>
                        <td className={clsx(classicTd, 'text-end font-mono tabular-nums')}>{s.memberCount(group.id)}</td>
                        <td className={clsx(classicTd, 'text-end whitespace-nowrap')} onClick={(e) => e.stopPropagation()}>
                          <RequirePerm feature="groups" level="Edit">
                            <ClassicButton onClick={() => s.openEdit(group)} aria-label={t('Edit group {{name}}', { name: group.name })}>{t('Edit')}</ClassicButton>{' '}
                            <ClassicButton onClick={() => s.handleDelete(group)} aria-label={t('Delete group {{name}}', { name: group.name })}>{t('Delete')}</ClassicButton>
                          </RequirePerm>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </ClassicTable>
              </QueryState>
            </div>

            <div className="col-span-12 lg:col-span-5 bg-white rounded border border-zinc-300">
              <div className="px-3 py-2 border-b border-zinc-300 bg-zinc-100 text-xs font-semibold">
                {effectiveSelected ? t('Members — {{name}}', { name: effectiveSelected.name }) : t('Members')}
              </div>
              {!effectiveSelected ? (
                <p className="p-6 text-center text-zinc-500 text-sm">{t('Select a group to manage its monitors.')}</p>
              ) : monitors.length === 0 ? (
                <p className="p-6 text-center text-zinc-500 text-sm">{t('No monitors configured.')}</p>
              ) : (
                <ul className="divide-y divide-zinc-200 max-h-[60vh] overflow-y-auto">
                  {monitors.map((m) => {
                    const isMember = memberIds.has(m.id);
                    const gm = memberships.find((x) => x.monitor_id === m.id);
                    return (
                      <li key={m.id}>
                        <label className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isMember}
                            disabled={s.membershipPending || !canEdit}
                            onChange={() => (isMember && gm ? s.detach(gm) : s.attach(m.id))}
                            aria-label={isMember ? t('Remove {{name}} from group', { name: m.name }) : t('Add {{name}} to group', { name: m.name })}
                          />
                          <span className="font-mono text-xs text-zinc-500 w-8">{m.id}</span>
                          <span>{m.name}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </main>

      <GroupEditDialog
        open={s.dialogOpen}
        editing={s.editing}
        groups={groups}
        onClose={s.closeDialog}
        onSubmit={s.handleSubmit}
        pending={s.dialogPending}
        error={s.dialogError}
      />
    </AppShell>
  );
}
