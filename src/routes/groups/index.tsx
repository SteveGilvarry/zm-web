import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  Users,
  Plus,
  Trash2,
  Monitor as MonitorIcon,
  Check,
  X,
  Pencil,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { useAuthStore } from '@/stores/auth';
import { getMonitors } from '@/api/monitors';
import {
  listGroups,
  listGroupMonitors,
  createGroup,
  updateGroup,
  deleteGroup,
  attachMonitorToGroup,
  detachMonitorFromGroup,
  type Group,
  type GroupMonitor,
} from '@/api/groups';
import type { Monitor } from '@/types';
import { buildGroupTree, getDescendantGroups } from '@/features/groups/tree';
import { GroupEditDialog } from '@/features/groups/GroupEditDialog';

export const Route = createFileRoute('/groups/')({
  component: GroupsPage,
});

function GroupsPage() {
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();

  const groupsQ = useQuery({
    queryKey: ['groups'],
    queryFn: () => listGroups({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const groupMonitorsQ = useQuery({
    queryKey: ['groups-monitors'],
    queryFn: () => listGroupMonitors({ page: 1, page_size: 1000 }),
    enabled: isAuthenticated,
  });
  const monitorsQ = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });

  const groups = groupsQ.data?.items ?? [];
  const groupMonitors = groupMonitorsQ.data?.items ?? [];
  const monitors = monitorsQ.data?.items ?? [];

  // Tree-flattened groups for indented rendering.
  const tree = useMemo(() => buildGroupTree(groups), [groups]);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = useMemo(
    () => groups.find((g) => g.id === selectedId) ?? null,
    [groups, selectedId],
  );

  // If the user hasn't picked one yet, default to the first.
  const effectiveSelected = selected ?? groups[0] ?? null;

  // Memberships scoped to the active group.
  const memberships = useMemo(
    () => (effectiveSelected
      ? groupMonitors.filter((gm) => gm.group_id === effectiveSelected.id)
      : []),
    [groupMonitors, effectiveSelected],
  );
  const memberIds = useMemo(() => new Set(memberships.map((m) => m.monitor_id)), [memberships]);

  /* ----- Mutations -------------------------------------------------------- */

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['groups'] });
    qc.invalidateQueries({ queryKey: ['groups-monitors'] });
  };

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogError(null);
    setDialogOpen(true);
  };
  const openEdit = (g: Group) => {
    setEditing(g);
    setDialogError(null);
    setDialogOpen(true);
  };
  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setDialogError(null);
  };

  const createMutation = useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId: number | null }) =>
      createGroup(name, parentId),
    onSuccess: (g) => {
      invalidate();
      setSelectedId(g.id);
      closeDialog();
    },
    onError: (e: Error) => setDialogError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name, parentId }: { id: number; name: string; parentId: number | null }) =>
      updateGroup(id, name, parentId),
    onSuccess: () => {
      invalidate();
      closeDialog();
    },
    onError: (e: Error) => setDialogError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteGroup(id),
    onSuccess: () => {
      invalidate();
      setSelectedId(null);
    },
  });
  const attachMutation = useMutation({
    mutationFn: ({ groupId, monitorId }: { groupId: number; monitorId: number }) =>
      attachMonitorToGroup(groupId, monitorId),
    onSuccess: invalidate,
  });
  const detachMutation = useMutation({
    mutationFn: (gmId: number) => detachMonitorFromGroup(gmId),
    onSuccess: invalidate,
  });

  const handleSubmit = ({ name, parentId }: { name: string; parentId: number | null }) => {
    setDialogError(null);
    if (editing) {
      updateMutation.mutate({ id: editing.id, name, parentId });
    } else {
      createMutation.mutate({ name, parentId });
    }
  };

  const handleDelete = (g: Group) => {
    const descendants = getDescendantGroups(groups, g.id);
    let message: string;
    if (descendants.length === 0) {
      message = `Delete group "${g.name}"?`;
    } else {
      const list = descendants.slice(0, 5).map((d) => `  - ${d.name}`).join('\n');
      const extra = descendants.length > 5 ? `\n  …and ${descendants.length - 5} more` : '';
      message =
        `Delete "${g.name}" and its ${descendants.length} sub-group` +
        (descendants.length === 1 ? '' : 's') +
        `?\n\nThe following will also be deleted:\n${list}${extra}`;
    }
    if (window.confirm(message)) deleteMutation.mutate(g.id);
  };

  if (!isAuthenticated) return null;

  return (
    <AppShell title="Groups">
      <main className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-12 gap-6">
          {/* Left — group tree + create */}
          <div className="col-span-4 space-y-4">
            <Panel title="Groups" icon={<Users size={16} />}>
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={openCreate}
                  className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded bg-cyan/20 text-cyan hover:bg-cyan/30 transition-colors"
                >
                  <Plus size={12} />
                  New group
                </button>
                <span className="text-[10px] text-text-muted">
                  {groups.length} total
                </span>
              </div>
              <ul
                aria-label="Groups tree"
                className="-mx-1 space-y-0.5 max-h-[60vh] overflow-y-auto"
              >
                {tree.length === 0 ? (
                  <li className="text-xs text-text-muted italic px-1 py-4 text-center">
                    No groups yet. Click "New group" to create one.
                  </li>
                ) : (
                  tree.map(({ group, depth }) => (
                    <GroupRow
                      key={group.id}
                      group={group}
                      depth={depth}
                      memberCount={groupMonitors.filter((gm) => gm.group_id === group.id).length}
                      active={effectiveSelected?.id === group.id}
                      onSelect={() => setSelectedId(group.id)}
                      onEdit={() => openEdit(group)}
                      onDelete={() => handleDelete(group)}
                    />
                  ))
                )}
              </ul>
            </Panel>
          </div>

          {/* Right — membership editor for the selected group */}
          <div className="col-span-8">
            <Panel
              title={effectiveSelected ? `Members — ${effectiveSelected.name}` : 'Members'}
              icon={<MonitorIcon size={16} />}
            >
              {!effectiveSelected ? (
                <div className="py-16 text-center text-text-muted text-sm">
                  Select a group to manage its monitors.
                </div>
              ) : monitors.length === 0 ? (
                <div className="py-16 text-center text-text-muted text-sm">
                  No monitors configured.
                </div>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {monitors.map((m) => (
                    <MonitorMembershipRow
                      key={m.id}
                      monitor={m}
                      isMember={memberIds.has(m.id)}
                      membership={memberships.find((gm) => gm.monitor_id === m.id)}
                      onAttach={() =>
                        attachMutation.mutate({
                          groupId: effectiveSelected.id,
                          monitorId: m.id,
                        })
                      }
                      onDetach={(gm) => detachMutation.mutate(gm.id)}
                      pending={attachMutation.isPending || detachMutation.isPending}
                    />
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      </main>

      <GroupEditDialog
        open={dialogOpen}
        editing={editing}
        groups={groups}
        onClose={closeDialog}
        onSubmit={handleSubmit}
        pending={createMutation.isPending || updateMutation.isPending}
        error={dialogError}
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
  onEdit: () => void;
  onDelete: () => void;
}) {
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
        style={{ paddingLeft: `${8 + indentPx}px` }}
      >
        {depth > 0 ? (
          <span aria-hidden className="text-text-muted text-[10px] -ml-1.5">↳</span>
        ) : null}
        <button
          onClick={onSelect}
          className="flex-1 text-left text-xs min-w-0"
        >
          <span className={clsx('font-medium block truncate', active ? 'text-cyan' : 'text-text-primary')}>
            {group.name}
          </span>
          <span className="text-[10px] text-text-muted">
            {memberCount} monitor{memberCount === 1 ? '' : 's'}
          </span>
        </button>
        <button
          onClick={onEdit}
          aria-label={`Edit group ${group.name}`}
          className="p-1 rounded text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={onDelete}
          aria-label={`Delete group ${group.name}`}
          className="p-1 rounded text-text-muted hover:text-crimson hover:bg-crimson/10 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 size={12} />
        </button>
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
          Member
          <X size={11} className="ml-1 opacity-60" />
        </button>
      ) : (
        <button
          onClick={onAttach}
          disabled={pending}
          className="flex items-center gap-1 px-2 py-1 rounded border border-border-subtle bg-surface text-text-muted text-[11px] hover:border-cyan/40 hover:text-cyan transition-colors disabled:opacity-50"
        >
          <Plus size={11} />
          Add
        </button>
      )}
    </li>
  );
}
