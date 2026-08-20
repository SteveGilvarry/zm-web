import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Plus,
  Trash2,
  Monitor as MonitorIcon,
  Check,
  X,
  Pencil,
  AlertTriangle,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import type { Group, GroupMonitor } from '@/api/groups';
import type { Monitor } from '@/types';
import { GroupEditDialog } from '@/features/groups/GroupEditDialog';
import { GROUP_REPARENT_ISSUE_URL, useGroupsPage } from '@/features/groups/useGroupsPage';
import { useSiteTitle } from '@/features/settings/useSiteTitle';

/** Groups — Mission Control. Tree on the left, membership editor on the right. */
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
      <main className="flex-1 p-6 overflow-auto">
        {s.parentWarning && (
          <div
            role="status"
            className="mb-4 flex items-start gap-2 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber"
          >
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span className="flex-1">
              {s.parentWarning}{' '}
              <a href={GROUP_REPARENT_ISSUE_URL} target="_blank" rel="noreferrer" className="underline">
                zm-api#28
              </a>
            </span>
            <button
              onClick={s.dismissParentWarning}
              aria-label={t('Dismiss')}
              className="p-0.5 rounded hover:bg-amber/20"
            >
              <X size={12} />
            </button>
          </div>
        )}
        <div className="grid grid-cols-12 gap-6">
          {/* Left — group tree + create */}
          <div className="col-span-4 space-y-4">
            <Panel title={t('Groups')} icon={<Users size={16} />}>
              <div className="flex items-center justify-between mb-3">
                <RequirePerm feature="groups" level="Edit" fallback={<span />}>
                  <button
                    onClick={s.openCreate}
                    className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded bg-cyan/20 text-cyan hover:bg-cyan/30 transition-colors"
                  >
                    <Plus size={12} />
                    {t('New group')}
                  </button>
                </RequirePerm>
                <span className="text-[10px] text-text-muted">
                  {t('{{count}} total', { count: groups.length })}
                </span>
              </div>
              <QueryState
                isLoading={s.isLoading}
                isError={s.isError}
                error={s.error}
                onRetry={s.refetch}
                empty={tree.length === 0}
                emptyMessage={t('No groups yet. Click "New group" to create one.')}
              >
                <ul
                  aria-label={t('Groups tree')}
                  className="-mx-1 space-y-0.5 max-h-[60vh] overflow-y-auto"
                >
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
            </Panel>
          </div>

          {/* Right — membership editor for the selected group */}
          <div className="col-span-8">
            <Panel
              title={effectiveSelected ? t('Members — {{name}}', { name: effectiveSelected.name }) : t('Members')}
              icon={<MonitorIcon size={16} />}
            >
              {!effectiveSelected ? (
                <div className="py-16 text-center text-text-muted text-sm">
                  {t('Select a group to manage its monitors.')}
                </div>
              ) : monitors.length === 0 ? (
                <div className="py-16 text-center text-text-muted text-sm">
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
            </Panel>
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
          'flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors group',
          active
            ? 'bg-cyan/10 border border-cyan/30'
            : 'border border-transparent hover:bg-surface/60',
        )}
        style={{ paddingInlineStart: `${8 + indentPx}px` }}
      >
        {depth > 0 ? (
          <span aria-hidden className="text-text-muted text-[10px] -ms-1.5">↳</span>
        ) : null}
        <button
          onClick={onSelect}
          className="flex-1 text-start text-xs min-w-0"
        >
          <span className={clsx('font-medium block truncate', active ? 'text-cyan' : 'text-text-primary')}>
            {group.name}
          </span>
          <span className="text-[10px] text-text-muted">
            {t('{{count}} monitor', { count: memberCount })}
          </span>
        </button>
        {onEdit && (
          <button
            onClick={onEdit}
            aria-label={t('Edit group {{name}}', { name: group.name })}
            className="p-1 rounded text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors opacity-0 group-hover:opacity-100"
          >
            <Pencil size={12} />
          </button>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            aria-label={t('Delete group {{name}}', { name: group.name })}
            className="p-1 rounded text-text-muted hover:text-crimson hover:bg-crimson/10 transition-colors opacity-0 group-hover:opacity-100"
          >
            <Trash2 size={12} />
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
    <li className="flex items-center justify-between py-2 px-1">
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            'w-2 h-2 rounded-full',
            monitor.capturing !== 'None' ? 'bg-emerald-500' : 'bg-text-muted/50',
          )}
        />
        <span className="text-sm text-text-primary">{monitor.name}</span>
        <span className="text-[10px] font-mono text-text-muted">#{monitor.id}</span>
      </div>
      {isMember && membership ? (
        <button
          onClick={() => onDetach(membership)}
          disabled={pending}
          className="flex items-center gap-1 px-2 py-1 rounded border border-cyan/40 bg-cyan/10 text-cyan text-[11px] hover:bg-cyan/20 transition-colors disabled:opacity-50"
        >
          <Check size={11} />
          {t('Member')}
          <X size={11} className="ms-1 opacity-60" />
        </button>
      ) : (
        <button
          onClick={onAttach}
          disabled={pending}
          className="flex items-center gap-1 px-2 py-1 rounded border border-border-subtle bg-surface text-text-muted text-[11px] hover:border-cyan/40 hover:text-cyan transition-colors disabled:opacity-50"
        >
          <Plus size={11} />
          {t('Add')}
        </button>
      )}
    </li>
  );
}
