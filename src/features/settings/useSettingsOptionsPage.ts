import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getSystemStatus,
  getDaemons,
  systemStartup,
  systemShutdown,
  systemRestart,
  startDaemon,
  stopDaemon,
  restartDaemon,
  systemLogRotate,
  getVersion,
} from '@/api/system';
import { getConfigs, updateConfig } from '@/api/configs';
import { useAuthStore } from '@/stores/auth';

export type SystemAction = 'startup' | 'shutdown' | 'restart' | 'logrotate';
export type DaemonAction = 'start' | 'stop' | 'restart';

export interface ConfirmAction {
  action: SystemAction;
  title: string;
  message: string;
}

export const CONFIG_PAGE_SIZE = 50;

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Data + state for Settings → Options: system overview, daemon control,
 * system actions (with confirm) and the inline ZoneMinder config editor.
 * All config filtering/paging is client-side (the API has no category param).
 */
export function useSettingsOptionsPage() {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();

  // System status
  const { data: systemStatus } = useQuery({
    queryKey: ['systemStatus'],
    queryFn: getSystemStatus,
    enabled: isAuthenticated,
    refetchInterval: 10000,
  });

  const { data: versionData } = useQuery({
    queryKey: ['version'],
    queryFn: getVersion,
    enabled: isAuthenticated,
  });

  // Daemons
  const { data: daemonData } = useQuery({
    queryKey: ['daemons'],
    queryFn: getDaemons,
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });

  // Fetch all configs in one request (API has no category filter param)
  const { data: allConfigsData, isLoading: configsLoading } = useQuery({
    queryKey: ['configs', 'all'],
    queryFn: () => getConfigs({ page: 1, page_size: 500 }),
    enabled: isAuthenticated,
  });

  const allConfigs = useMemo(() => allConfigsData?.items ?? [], [allConfigsData]);

  // Build category list with counts
  const categoryList = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const c of allConfigs) {
      countMap.set(c.category, (countMap.get(c.category) || 0) + 1);
    }
    return Array.from(countMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => ({ name, count }));
  }, [allConfigs]);

  // Config state — all filtering is client-side
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [configPage, setConfigPage] = useState(1);
  const [configSearch, setConfigSearch] = useState('');

  // Filter by category then search, then paginate client-side
  const filteredConfigs = useMemo(() => {
    let result = allConfigs;
    if (selectedCategory) {
      result = result.filter((c) => c.category === selectedCategory);
    }
    if (configSearch) {
      const q = configSearch.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }
    return result;
  }, [allConfigs, selectedCategory, configSearch]);

  const configTotalPages = Math.max(1, Math.ceil(filteredConfigs.length / CONFIG_PAGE_SIZE));
  const paginatedConfigs = filteredConfigs.slice(
    (configPage - 1) * CONFIG_PAGE_SIZE,
    configPage * CONFIG_PAGE_SIZE,
  );

  const selectCategory = (cat: string | null) => {
    setSelectedCategory(cat);
    setConfigPage(1);
    setConfigSearch('');
  };
  const prevConfigPage = () => setConfigPage((p) => Math.max(1, p - 1));
  const nextConfigPage = () => setConfigPage((p) => Math.min(configTotalPages, p + 1));

  // System action confirm dialogs
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const systemMutation = useMutation({
    mutationFn: async (action: string) => {
      switch (action) {
        case 'startup':
          return systemStartup();
        case 'shutdown':
          return systemShutdown();
        case 'restart':
          return systemRestart();
        case 'logrotate':
          return systemLogRotate();
      }
    },
    onSuccess: () => {
      setConfirmAction(null);
      queryClient.invalidateQueries({ queryKey: ['systemStatus'] });
      queryClient.invalidateQueries({ queryKey: ['daemons'] });
    },
  });

  // Daemon mutations
  const daemonMutation = useMutation({
    mutationFn: async ({ name, action }: { name: string; action: DaemonAction }) => {
      switch (action) {
        case 'start':
          return startDaemon(name);
        case 'stop':
          return stopDaemon(name);
        case 'restart':
          return restartDaemon(name);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daemons'] });
    },
  });

  // Inline config edit
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const configMutation = useMutation({
    mutationFn: ({ name, value }: { name: string; value: string }) => updateConfig(name, value),
    onSuccess: () => {
      setEditingConfig(null);
      queryClient.invalidateQueries({ queryKey: ['configs'] });
    },
  });

  const startEdit = (name: string, currentValue: string) => {
    setEditingConfig(name);
    setEditValue(currentValue);
  };
  const saveEdit = (name: string) => {
    configMutation.mutate({ name, value: editValue });
  };
  const cancelEdit = () => setEditingConfig(null);

  const stats = systemStatus?.stats;
  const daemons = daemonData?.daemons || [];
  const memoryUsedPercent =
    stats && stats.total_mem > 0
      ? ((stats.total_mem - stats.free_mem) / stats.total_mem) * 100
      : 0;

  return {
    isAuthenticated,
    // overview
    systemStatus,
    versionData,
    stats,
    memoryUsedPercent,
    // daemons
    daemons,
    runDaemonAction: daemonMutation.mutate,
    isDaemonActionPending: daemonMutation.isPending,
    // system actions
    confirmAction,
    setConfirmAction,
    runSystemAction: systemMutation.mutate,
    isSystemActionPending: systemMutation.isPending,
    // configs
    allConfigs,
    configsLoading,
    categoryList,
    selectedCategory,
    selectCategory,
    configSearch,
    setConfigSearch,
    configPage,
    configTotalPages,
    prevConfigPage,
    nextConfigPage,
    filteredConfigs,
    paginatedConfigs,
    // inline edit
    editingConfig,
    editValue,
    setEditValue,
    startEdit,
    saveEdit,
    cancelEdit,
    isConfigSaving: configMutation.isPending,
  };
}
