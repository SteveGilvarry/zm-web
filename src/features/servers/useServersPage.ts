import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listServers, deleteServer, type Server } from '@/api/servers';
import { getMonitors } from '@/api/monitors';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { fetchLatestServerStats, summarizeStat, type ServerLoadSummary } from './serverStats';

export interface ServerRow {
  server: Server;
  /** Monitors whose `server_id` points here. */
  monitorCount: number;
  /** Newest `zmstats.pl` sample for this server, if any. */
  load: ServerLoadSummary | null;
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
        monitorCount: counts.get(server.id) ?? 0,
        load: stat ? summarizeStat(stat) : null,
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

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteServer(id),
    onSuccess: (_r, id) => {
      toast.success(t('Server deleted'));
      if (editing?.id === id) setEditing(null);
      invalidateServers();
    },
    onError: (err) => toast.apiError(err),
  });

  const [deleteTarget, setDeleteTarget] = useState<Server | null>(null);
  const confirmDelete = () => {
    if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
    setDeleteTarget(null);
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
    cancelDelete: () => setDeleteTarget(null),
    isDeleting: deleteMutation.isPending,
    statsError: statsQ.error?.message ?? null,
    confirmDelete,
    invalidateServers,
    editing,
    startEdit: setEditing,
    cancelEdit: () => setEditing(null),
    onSaved: () => {
      invalidateServers();
      setEditing(null);
    },
  };
}
