import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listServers, deleteServer, type Server } from '@/api/servers';
import { useAuthStore } from '@/stores/auth';

/**
 * Cluster / multi-server admin. In ZoneMinder you can run capture + analysis
 * across a fleet of "servers" so monitor work distributes geographically.
 * Each row is a registered backend host the controller can dispatch to.
 */
export function useServersPage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();

  const serversQ = useQuery({
    queryKey: ['servers'],
    queryFn: () => listServers({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const servers: Server[] = serversQ.data?.items ?? [];

  const invalidateServers = () => qc.invalidateQueries({ queryKey: ['servers'] });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteServer(id),
    onSuccess: invalidateServers,
  });

  const confirmDelete = (s: Server) => {
    if (confirm(t('Delete server "{{name}}"?', { name: s.name }))) deleteMutation.mutate(s.id);
  };

  return { isAuthenticated, servers, confirmDelete, invalidateServers };
}
