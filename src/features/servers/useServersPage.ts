import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listServers, deleteServer, type Server } from '@/api/servers';
import { getMonitors } from '@/api/monitors';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { fetchLatestServerStats, summarizeStat, type ServerLoadSummary } from './serverStats';
import { serverCoords, serverDaemons, serverUrl, type ServerDaemonFlag } from './serverFields';

export interface ServerRow {
  server: Server;
  /**
   * Monitors whose `server_id` points here — `ServerResponse.monitor_count`
   * when the backend counted them, else counted from `/monitors` for an older
   * zm-api.
   */
  monitorCount: number;
  /** Newest `zmstats.pl` sample for this server, if any. */
  load: ServerLoadSummary | null;
  /** Legacy `Url` column — `protocol://hostname:port`, null without a hostname. */
  url: string | null;
  /** RunStats / RunAudit / RunTrigger / RunEventNotification, in that order. */
  daemons: ServerDaemonFlag[];
  /** `Latitude, Longitude`, or null unless the row carries both. */
  coords: string | null;
}

/**
 * Cluster / multi-server admin. In ZoneMinder you can run capture + analysis
 * across a fleet of "servers" so monitor work distributes geographically.
 * Each row is a registered backend host the controller can dispatch to,
 * with its monitor count and latest load sample alongside (legacy S3/S4).
 */
export function useServersPage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();
  const toast = useToast();

  const serversQ = useQuery({
    queryKey: ['servers'],
    queryFn: () => listServers({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const monitorsQ = useQuery({
    queryKey: ['monitors', 'for-servers'],
    queryFn: () => getMonitors({ page: 1, page_size: 1000 }),
    enabled: isAuthenticated,
  });
  const statsQ = useQuery({
    queryKey: ['server-stats', 'latest'],
    queryFn: () => fetchLatestServerStats(),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

  const servers: Server[] = useMemo(() => serversQ.data?.items ?? [], [serversQ.data]);

  const rows: ServerRow[] = useMemo(() => {
    const counts = new Map<number, number>();
    for (const m of monitorsQ.data?.items ?? []) {
      const key = m.server_id ?? 0;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return servers.map((server) => {
      const stat = statsQ.data?.get(server.id);
      return {
        server,
        monitorCount: server.monitor_count ?? counts.get(server.id) ?? 0,
        load: stat ? summarizeStat(stat) : null,
        url: serverUrl(server),
        daemons: serverDaemons(server),
        coords: serverCoords(server),
      };
    });
  }, [servers, monitorsQ.data, statsQ.data]);

  /**
   * Single-node installs record stats under server_id 0 and register no
   * server rows; surface that sample so the page is not blank.
   */
  const localLoad: ServerLoadSummary | null = useMemo(() => {
    const stat = statsQ.data?.get(0);
    return stat ? summarizeStat(stat) : null;
  }, [statsQ.data]);

  const invalidateServers = () => {
    qc.invalidateQueries({ queryKey: ['servers'] });
  };

  const [editing, setEditing] = useState<Server | null>(null);

  /**
   * The read-only half of the row (daemon flags, state, coordinates) does not
   * fit the table, so one row at a time expands to show it.
   */
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const toggleDetail = (id: number) => setExpandedId((cur) => (cur === id ? null : id));

  /** The add/edit form, which legacy opens as a modal. */
  const [formOpen, setFormOpen] = useState(false);

  /** Legacy's Mark column: rows ticked for Delete. Gone rows drop out. */
  const [marked, setMarked] = useState<Set<number>>(() => new Set());
  const selectedIds = new Set(servers.filter((sv) => marked.has(sv.id)).map((sv) => sv.id));
  const toggleSelected = (id: number) => setMarked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const toggleAll = () => setMarked(
    selectedIds.size === servers.length ? new Set() : new Set(servers.map((sv) => sv.id)),
  );

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) await deleteServer(id);
    },
    onSuccess: (_r, ids) => {
      toast.success(t('Server deleted'));
      if (editing && ids.includes(editing.id)) setEditing(null);
      setMarked((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
      invalidateServers();
    },
    onError: (err) => {
      invalidateServers();
      toast.apiError(err);
    },
  });

  /** One server (a row's own Delete) or every marked one. */
  const [deleteTarget, setDeleteTarget] = useState<Server | null>(null);
  const [deleteMarked, setDeleteMarked] = useState(false);
  const confirmDelete = () => {
    if (deleteTarget) deleteMutation.mutate([deleteTarget.id]);
    else if (deleteMarked && selectedIds.size > 0) deleteMutation.mutate([...selectedIds]);
    setDeleteTarget(null);
    setDeleteMarked(false);
  };

  return {
    isAuthenticated,
    isLoading: serversQ.isLoading,
    isError: serversQ.isError,
    error: serversQ.error,
    refetch: () => void serversQ.refetch(),
    servers,
    rows,
    localLoad,
    deleteTarget,
    requestDelete: setDeleteTarget,
    deleteMarked,
    requestDeleteMarked: () => setDeleteMarked(true),
    cancelDelete: () => {
      setDeleteTarget(null);
      setDeleteMarked(false);
    },
    selectedIds,
    toggleSelected,
    toggleAll,
    isDeleting: deleteMutation.isPending,
    statsError: statsQ.error?.message ?? null,
    confirmDelete,
    invalidateServers,
    expandedId,
    toggleDetail,
    editing,
    startEdit: (server: Server) => {
      setEditing(server);
      setFormOpen(true);
    },
    formOpen,
    openCreate: () => {
      setEditing(null);
      setFormOpen(true);
    },
    cancelEdit: () => {
      setEditing(null);
      setFormOpen(false);
    },
    onSaved: () => {
      invalidateServers();
      setEditing(null);
      setFormOpen(false);
    },
  };
}
