import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { clsx } from 'clsx';
import { Users, Plus, Trash2, Monitor as MonitorIcon, Check, X } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { useAuthStore } from '@/stores/auth';
import { getMonitors } from '@/api/monitors';
import {
  listGroups,
  listGroupMonitors,
  createGroup,
  deleteGroup,
  attachMonitorToGroup,
  detachMonitorFromGroup,
  type Group,
  type GroupMonitor,
} from '@/api/groups';
import type { Monitor } from '@/types';

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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['groups'] });
    qc.invalidateQueries({ queryKey: ['groups-monitors'] });
  };

  const createMutation = useMutation({
    mutationFn: (name: string) => createGroup(name),
    onSuccess: (g) => {
      invalidate();
      setSelectedId(g.id);
    },
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

  if (!isAuthenticated) return null;

  return (
    <AppShell title="Groups">
      <main className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-12 gap-6">
          {/* Left — group list + create */}
          <div className="col-span-4 space-y-4">
            <Panel title="Groups" icon={<Users size={16} />}>
              <CreateGroupForm onSubmit={(n) => createMutation.mutate(n)} />
              <ul className="mt-3 -mx-1 space-y-0.5 max-h-[60vh] overflow-y-auto">
                {groups.length === 0 ? (
                  <li className="text-xs text-text-muted italic px-1 py-4 text-center">
                    No groups yet. Create one above.
                  </li>
                ) : (
                  groups.map((g) => (
                    <GroupRow
                      key={g.id}
                      group={g}
                      memberCount={groupMonitors.filter((gm) => gm.group_id === g.id).length}
                      active={effectiveSelected?.id === g.id}
                      onSelect={() => setSelectedId(g.id)}
                      onDelete={() => {
                        if (confirm(`Delete group "${g.name}"?`)) deleteMutation.mutate(g.id);
                      }}
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
    </AppShell>
  );
}

function CreateGroupForm({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState('');
  const handle = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setName('');
  };
  return (
    <form
      onSubmit={handle}
      className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border-subtle bg-surface"
    >
      <Plus size={12} className="text-text-muted" />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New group name"
        className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
      />
      <button
        type="submit"
        disabled={!name.trim()}
        className="px-2 py-0.5 text-[10px] font-medium rounded bg-cyan/20 text-cyan hover:bg-cyan/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Create
      </button>
    </form>
  );
}

function GroupRow({
  group, memberCount, active, onSelect, onDelete,
}: {
  group: Group;
  memberCount: number;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <li>
      <div
        className={clsx(
          'flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors group',
          active
            ? 'bg-cyan/10 border border-cyan/30'
            : 'border border-transparent hover:bg-surface/60',
        )}
      >
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
