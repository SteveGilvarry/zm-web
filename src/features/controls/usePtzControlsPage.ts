import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listControls, deleteControl, type Control } from '@/api/controls';
import { useAuthStore } from '@/stores/auth';

/**
 * PTZ control-protocol definitions. Read-only list with a delete escape
 * hatch; editing the full capability matrix is deferred.
 */
export function usePtzControlsPage() {
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<Control | null>(null);

  const controlsQ = useQuery({
    queryKey: ['controls'],
    queryFn: () => listControls({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteControl(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['controls'] }),
  });

  const controls = controlsQ.data?.items ?? [];

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteMutation.mutate(pendingDelete.id);
    setPendingDelete(null);
  };

  return {
    isLoading: controlsQ.isLoading,
    controls,
    pendingDelete,
    requestDelete: setPendingDelete,
    cancelDelete: () => setPendingDelete(null),
    confirmDelete,
  };
}
