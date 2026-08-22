import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Check, X, Pencil } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import type { Group, GroupMonitor } from '@/api/groups';
import type { Monitor } from '@/types';
import { GroupEditDialog } from '@/features/groups/GroupEditDialog';
import { useGroupsPage } from '@/features/groups/useGroupsPage';
import { useSiteTitle } from '@/features/settings/useSiteTitle';

/**
 * Groups — the modern skin. One action line, then two panes that each own
 * their height and scroll inside themselves: the group tree on the start
 * side, the membership editor on the end side (docs/DESIGN.md).
 */
export default function GroupsPage() {
  const { t } = useTranslation();
  const s = useGroupsPage();
  const { can } = usePerms();
  useSiteTitle(t('Groups'));
  const { groups, monitors, tree, effectiveSelected, memberships, memberIds } = s;
  const canEdit = can('groups', 'Edit');

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={t('Groups')}>
      <main className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center gap-2 px-3 h-11 shrink-0 border-b border-border-subtle bg-surface">
          <RequirePerm feature="groups" level="Edit" fallback={<span />}>
            <button
              onClick={s.openCreate}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors"
            >
              <Plus size={12} aria-hidden />
              {t('New group')}
            </button>
          </RequirePerm>
          <span className="ms-auto text-xs text-fg-dim">
            {t('{{count}} total', { count: groups.length })}
          </span>
        </div>

        <div className="flex-1 min-h-0 flex">
          {/* Group tree */}
          <div className="w-72 shrink-0 min-h-0 overflow-auto border-e border-border-subtle p-2">
            <QueryState
              isLoading={s.isLoading}
              isError={s.isError}
              error={s.error}
              onRetry={s.refetch}
              empty={tree.length === 0}
              emptyMessage={t('No groups yet. Click "New group" to create one.')}
            >
              <ul aria-label={t('Groups tree')} className="space-y-0.5">
                {tree.map(({ group, depth }) => (
                  <GroupRow
                    key={group.id}
                    group={group}
                    depth={depth}
                    memberCount={s.memberCount(group.id)}
                    active={effectiveSelected?.id === group.id}
                    onSelect={() => s.select(group.id)}
                    onEdit={canEdit ? () => s.openEdit(group) : undefined}
                    onDelete={canEdit ? () => s.handleDelete(group) : undefined}
                  />
                ))}
              </ul>
            </QueryState>
          </div>

          {/* Membership editor for the selected group */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <div className="shrink-0 px-3 py-2 border-b border-border-subtle text-sm text-fg">
              {effectiveSelected
                ? t('Members — {{name}}', { name: effectiveSelected.name })
                : t('Members')}
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {!effectiveSelected ? (
                <div className="py-16 text-center text-fg-dim text-sm">
                  {t('Select a group to manage its monitors.')}
                </div>
              ) : monitors.length === 0 ? (
                <div className="py-16 text-center text-fg-dim text-sm">
                  {t('No monitors configured.')}
                </div>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {monitors.map((m) => (
                    <MonitorMembershipRow
                      key={m.id}
                      monitor={m}
                      isMember={memberIds.has(m.id)}
                      membership={memberships.find((gm) => gm.monitor_id === m.id)}
                      onAttach={() => s.attach(m.id)}
                      onDetach={s.detach}
                      pending={s.membershipPending || !canEdit}
                    />
                  ))}
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

function GroupRow({
  group, depth, memberCount, active, onSelect, onEdit, onDelete,
}: {
  group: Group;
  depth: number;
  memberCount: number;
  active: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  // 16px per depth level — visually obvious, doesn't blow up the column.
  const indentPx = depth * 16;
  return (
    <li data-depth={depth}>
      <div
        className={clsx(
          'flex items-center gap-2 px-2 py-1.5 rounded transition-colors',
          active ? 'bg-accent/10' : 'hover:bg-surface-2',
        )}
        style={{ paddingInlineStart: `${8 + indentPx}px` }}
      >
        {depth > 0 ? (
          <span aria-hidden className="text-fg-faint text-xs -ms-1.5">↳</span>
        ) : null}
        <button onClick={onSelect} className="flex-1 text-start min-w-0">
          <span className={clsx('text-sm block truncate', active ? 'text-accent' : 'text-fg')}>
            {group.name}
          </span>
          <span className="text-xs text-fg-dim">
            {t('{{count}} monitor', { count: memberCount })}
          </span>
        </button>
        {onEdit && (
          <button
            onClick={onEdit}
            aria-label={t('Edit group {{name}}', { name: group.name })}
            className="p-1 rounded text-fg-dim hover:text-fg hover:bg-surface-3 transition-colors"
          >
            <Pencil size={14} />
          </button>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            aria-label={t('Delete group {{name}}', { name: group.name })}
            className="p-1 rounded text-fg-dim hover:text-danger hover:bg-surface-3 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </li>
  );
}

function MonitorMembershipRow({
  monitor, isMember, membership, onAttach, onDetach, pending,
}: {
  monitor: Monitor;
  isMember: boolean;
  membership?: GroupMonitor;
  onAttach: () => void;
  onDetach: (gm: GroupMonitor) => void;
  pending: boolean;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 px-3">
      <div className="flex items-center gap-2 min-w-0">
        {/* Colour is state: a capturing monitor is live, anything else is grey. */}
        <span
          className={clsx(
            'w-2 h-2 rounded-full shrink-0',
            monitor.capturing !== 'None' ? 'bg-ok' : 'bg-fg-faint',
          )}
          aria-hidden
        />
        <span className="text-sm text-fg truncate">{monitor.name}</span>
        <span className="text-xs font-mono tabular-nums text-fg-dim">#{monitor.id}</span>
      </div>
      {isMember && membership ? (
        <button
          onClick={() => onDetach(membership)}
          disabled={pending}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-50"
        >
          <Check size={12} aria-hidden />
          {t('Member')}
          <X size={12} className="ms-1 opacity-60" aria-hidden />
        </button>
      ) : (
        <button
          onClick={onAttach}
          disabled={pending}
          className="flex items-center gap-1 px-2 py-1 rounded border border-border-subtle text-xs text-fg-dim hover:text-fg hover:border-border transition-colors disabled:opacity-50"
        >
          <Plus size={12} aria-hidden />
          {t('Add')}
        </button>
      )}
    </li>
  );
}
