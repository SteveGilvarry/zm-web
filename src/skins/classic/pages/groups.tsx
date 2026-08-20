import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';

import { AppShell } from '@/skins/AppShell';
import { GroupEditDialog } from '@/features/groups/GroupEditDialog';
import { GROUP_REPARENT_ISSUE_URL, useGroupsPage } from '@/features/groups/useGroupsPage';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';

const btn = 'px-2 py-0.5 text-xs border border-zinc-500 rounded-sm bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40';

/**
 * Groups — classic skin. Legacy `?view=groups`: an indented group table
 * with monitor counts, and a checkbox list of monitors for the selected
 * group in place of the legacy multi-select.
 */
export default function ClassicGroupsPage() {
  const { t } = useTranslation();
  const s = useGroupsPage();
  useDocumentTitle(t('Groups'));

  if (!s.isAuthenticated) return null;
  const { groups, monitors, tree, effectiveSelected, memberIds, memberships } = s;
  const parentName = (id: number | null | undefined) => groups.find((g) => g.id === id)?.name ?? '';

  return (
    <AppShell title={t('Groups')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl text-zinc-800 font-semibold">{t('Groups')}</h1>
            <button type="button" onClick={s.openCreate} className={btn}>{t('New group')}</button>
          </div>

          {s.parentWarning && (
            <div role="status" className="flex items-start gap-2 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span className="flex-1">
                {s.parentWarning}{' '}
                <a href={GROUP_REPARENT_ISSUE_URL} target="_blank" rel="noreferrer" className="underline">zm-api#28</a>
              </span>
              <button type="button" onClick={s.dismissParentWarning} aria-label={t('Dismiss')} className="font-semibold">×</button>
            </div>
          )}

          <div className="grid grid-cols-12 gap-4 items-start">
            <div className="col-span-12 lg:col-span-7 bg-white rounded border border-zinc-300 overflow-hidden">
              <table className="w-full text-sm text-zinc-800">
                <thead className="bg-zinc-100 border-b border-zinc-300 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-start font-semibold">{t('Name')}</th>
                    <th className="px-3 py-2 text-start font-semibold">{t('Parent')}</th>
                    <th className="px-3 py-2 text-end font-semibold">{t('Monitors')}</th>
                    <th className="px-3 py-2 text-end font-semibold">{t('Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tree.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-zinc-500 italic">
                        {t('No groups yet. Click "New group" to create one.')}
                      </td>
                    </tr>
                  )}
                  {tree.map(({ group, depth }) => (
                    <tr
                      key={group.id}
                      data-depth={depth}
                      onClick={() => s.select(group.id)}
                      className={clsx(
                        'border-b border-zinc-200 cursor-pointer',
                        effectiveSelected?.id === group.id ? 'bg-zinc-100' : 'hover:bg-zinc-50',
                      )}
                    >
                      <td className="px-3 py-1.5" style={{ paddingInlineStart: `${0.75 + depth * 1.25}rem` }}>
                        {depth > 0 && <span className="text-zinc-400 me-1">↳</span>}
                        {group.name}
                      </td>
                      <td className="px-3 py-1.5 text-zinc-600">{parentName(group.parent_id) || '—'}</td>
                      <td className="px-3 py-1.5 text-end font-mono tabular-nums">{s.memberCount(group.id)}</td>
                      <td className="px-3 py-1.5 text-end whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => s.openEdit(group)} aria-label={t('Edit group {{name}}', { name: group.name })} className={btn}>{t('Edit')}</button>{' '}
                        <button type="button" onClick={() => s.handleDelete(group)} aria-label={t('Delete group {{name}}', { name: group.name })} className={btn}>{t('Delete')}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                            disabled={s.membershipPending}
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
