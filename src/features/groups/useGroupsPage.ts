import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
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
import { buildGroupTree, getDescendantGroups } from './tree';

/** What the edit dialog hands back on Save. */
interface SaveInput {
  name: string;
  parentId: number | null;
  /** Absent when the skin edits membership elsewhere (the modern panel). */
  monitorIds?: number[];
}

export interface GroupsPageState {
  isAuthenticated: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  groups: Group[];
  groupMonitors: GroupMonitor[];
  monitors: Monitor[];
  /** Depth-annotated, flattened tree for indented rendering. */
  tree: ReturnType<typeof buildGroupTree>;
  /** The explicitly selected group, else the first one, else null. */
  effectiveSelected: Group | null;
  select: (id: number) => void;
  /** Memberships of the active group. */
  memberships: GroupMonitor[];
  memberIds: Set<number>;
  memberCount: (groupId: number) => number;

  dialogOpen: boolean;
  editing: Group | null;
  dialogError: string | null;
  openCreate: () => void;
  openEdit: (g: Group) => void;
  closeDialog: () => void;
  handleSubmit: (v: { name: string; parentId: number | null; monitorIds?: number[] }) => void;
  dialogPending: boolean;

  /** Confirms (listing descendants) and deletes. */
  handleDelete: (g: Group) => void;
  /** Ids ticked in legacy's Mark column. */
  marked: Set<number>;
  toggleMark: (id: number) => void;
  /** Legacy's "Delete" toolbar button: confirms, then deletes every mark. */
  deleteMarked: () => void;
  /** Monitor ids in a group, for the edit dialog's multi-select. */
  monitorIdsOf: (groupId: number) => number[];
  /** Monitor names in a group, joined the way legacy's Monitors column is. */
  monitorNamesOf: (groupId: number) => string;
  attach: (monitorId: number) => void;
  detach: (gm: GroupMonitor) => void;
  membershipPending: boolean;
}

/** Group tree + membership editor state for the Groups page. */
export function useGroupsPage(): GroupsPageState {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();
  const toast = useToast();

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

  const groups = useMemo(() => groupsQ.data?.items ?? [], [groupsQ.data]);
  const groupMonitors = useMemo(() => groupMonitorsQ.data?.items ?? [], [groupMonitorsQ.data]);
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

  /**
   * Make the group's memberships match `monitorIds` — legacy's modal saves
   * the whole `MonitorIds[]` set at once, so a save is a diff against what
   * `/groups-monitors` currently holds, not a per-checkbox round trip.
   */
  const syncMonitors = async (groupId: number, monitorIds: number[]) => {
    const current = groupMonitors.filter((gm) => gm.group_id === groupId);
    for (const gm of current) {
      if (!monitorIds.includes(gm.monitor_id)) await detachMonitorFromGroup(gm.id);
    }
    for (const monitorId of monitorIds) {
      if (!current.some((gm) => gm.monitor_id === monitorId)) {
        await attachMonitorToGroup(groupId, monitorId);
      }
    }
  };

  const createMutation = useMutation({
    mutationFn: async ({ name, parentId, monitorIds }: SaveInput) => {
      const group = await createGroup(name, parentId);
      if (monitorIds) await syncMonitors(group.id, monitorIds);
      return group;
    },
    onSuccess: (g) => {
      invalidate();
      setSelectedId(g.id);
      closeDialog();
    },
    onError: (e: Error) => {
      setDialogError(e.message);
      toast.apiError(e);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, parentId, monitorIds }: SaveInput & { id: number }) => {
      const group = await updateGroup(id, name, parentId);
      if (monitorIds) await syncMonitors(id, monitorIds);
      return group;
    },
    onSuccess: () => {
      invalidate();
      closeDialog();
    },
    onError: (e: Error) => {
      setDialogError(e.message);
      toast.apiError(e);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteGroup(id),
    onSuccess: () => {
      toast.success(t('Group deleted'));
      invalidate();
      setSelectedId(null);
    },
    onError: (err) => toast.apiError(err),
  });
  const attachMutation = useMutation({
    mutationFn: ({ groupId, monitorId }: { groupId: number; monitorId: number }) =>
      attachMonitorToGroup(groupId, monitorId),
    onSuccess: invalidate,
    onError: (err) => toast.apiError(err),
  });
  const detachMutation = useMutation({
    mutationFn: (gmId: number) => detachMonitorFromGroup(gmId),
    onSuccess: invalidate,
    onError: (err) => toast.apiError(err),
  });

  const handleSubmit = ({ name, parentId, monitorIds }: SaveInput) => {
    setDialogError(null);
    if (editing) {
      updateMutation.mutate({ id: editing.id, name, parentId, monitorIds });
    } else {
      createMutation.mutate({ name, parentId, monitorIds });
    }
  };

  const handleDelete = (g: Group) => {
    const descendants = getDescendantGroups(groups, g.id);
    let message: string;
    if (descendants.length === 0) {
      message = t('Delete group "{{name}}"?', { name: g.name });
    } else {
      const list = descendants.slice(0, 5).map((d) => `  - ${d.name}`).join('\n');
      const extra = descendants.length > 5
        ? '\n  ' + t('…and {{count}} more', { count: descendants.length - 5 })
        : '';
      message = [
        t('Delete "{{name}}" and its {{count}} sub-group?', { name: g.name, count: descendants.length }),
        '',
        t('The following will also be deleted:'),
        list + extra,
      ].join('\n');
    }
    if (window.confirm(message)) deleteMutation.mutate(g.id);
  };

  // Legacy's Mark column + Delete button.
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const toggleMark = (id: number) =>
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const deleteMarked = () => {
    const targets = groups.filter((g) => marked.has(g.id));
    if (!targets.length) return;
    const message = t('Delete {{count}} group and everything under it? This cannot be undone.', {
      count: targets.length,
    }) + '\n\n' + targets.map((g) => `  - ${g.name}`).join('\n');
    if (!window.confirm(message)) return;
    targets.forEach((g) => deleteMutation.mutate(g.id));
    setMarked(new Set());
  };

  const monitorIdsOf = (groupId: number) =>
    groupMonitors.filter((gm) => gm.group_id === groupId).map((gm) => gm.monitor_id);
  const monitorNamesOf = (groupId: number) =>
    monitorIdsOf(groupId)
      .map((id) => monitors.find((m) => m.id === id)?.name ?? String(id))
      .join(', ');

  return {
    isAuthenticated,
    isLoading: groupsQ.isLoading,
    isError: groupsQ.isError,
    error: groupsQ.error,
    refetch: () => void groupsQ.refetch(),
    groups,
    groupMonitors,
    monitors,
    tree,
    effectiveSelected,
    select: setSelectedId,
    memberships,
    memberIds,
    memberCount: (groupId) => groupMonitors.filter((gm) => gm.group_id === groupId).length,

    dialogOpen,
    editing,
    dialogError,
    openCreate,
    openEdit,
    closeDialog,
    handleSubmit,
    dialogPending: createMutation.isPending || updateMutation.isPending,

    handleDelete,
    marked,
    toggleMark,
    deleteMarked,
    monitorIdsOf,
    monitorNamesOf,
    attach: (monitorId) => {
      if (effectiveSelected) {
        attachMutation.mutate({ groupId: effectiveSelected.id, monitorId });
      }
    },
    detach: (gm) => detachMutation.mutate(gm.id),
    membershipPending: attachMutation.isPending || detachMutation.isPending,
  };
}
