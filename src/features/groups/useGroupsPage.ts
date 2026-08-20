import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { buildGroupTree, getDescendantGroups } from './tree';

/** zm_api issue tracking `parent_id` being ignored on PUT /groups/{id}. */
export const GROUP_REPARENT_ISSUE_URL = 'https://github.com/SteveGilvarry/zm-api/issues/28';

export interface GroupsPageState {
  isAuthenticated: boolean;
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
  handleSubmit: (v: { name: string; parentId: number | null }) => void;
  dialogPending: boolean;
  /**
   * Set after a save whose parent change the backend silently dropped
   * (builds before zm-api#28 echo the old `parent_id`). Non-blocking: the
   * rename still went through.
   */
  parentWarning: string | null;
  dismissParentWarning: () => void;

  /** Confirms (listing descendants) and deletes. */
  handleDelete: (g: Group) => void;
  attach: (monitorId: number) => void;
  detach: (gm: GroupMonitor) => void;
  membershipPending: boolean;
}

/** Group tree + membership editor state for the Groups page. */
export function useGroupsPage(): GroupsPageState {
  const { t } = useTranslation();
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
  const [parentWarning, setParentWarning] = useState<string | null>(null);

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
    onSuccess: (saved, { parentId }) => {
      if ((saved.parent_id ?? null) !== parentId) {
        setParentWarning(
          t('This zm_api build ignores parent changes on update — "{{name}}" was renamed but kept its old parent. Needs zm-api#28.', { name: saved.name }),
        );
      }
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
    setParentWarning(null);
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

  return {
    isAuthenticated,
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
    parentWarning,
    dismissParentWarning: () => setParentWarning(null),

    handleDelete,
    attach: (monitorId) => {
      if (effectiveSelected) {
        attachMutation.mutate({ groupId: effectiveSelected.id, monitorId });
      }
    },
    detach: (gm) => detachMutation.mutate(gm.id),
    membershipPending: attachMutation.isPending || detachMutation.isPending,
  };
}
