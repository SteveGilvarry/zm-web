import { useZmConfig } from '@/features/config/useZmConfig';
import { updateNotice } from './updateNotice';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
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
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/common/toastStore';
import { configDefaultValue, configPatternError } from './configFormat';
import { DISPLAY_TAB, buildOptionsTabs, visibleCategories } from './optionsTabs';
import type { ZmConfig } from '@/types';

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
 * Configs are fetched once and filtered client-side. The selected category
 * lives in `?category=` so the classic rail (and bookmarks) can deep-link
 * straight to a tab, as legacy `?view=options&tab=web` did.
 */
export function useSettingsOptionsPage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const toast = useToast();
  const x10Enabled = useZmConfig('ZM_OPT_X10', false);
  const search = useSearch({ strict: false }) as { category?: unknown };
  const navigate = useNavigate();

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

  // `ZM_CHECK_FOR_UPDATES`: ZoneMinder's own updater records the newest
  // release it has seen in `ZM_DYN_LAST_VERSION`; we only compare and show.
  // No network call of ours, so an air-gapped install stays silent.
  const checkForUpdates = useZmConfig('ZM_CHECK_FOR_UPDATES', false);
  const lastVersion = useZmConfig('ZM_DYN_LAST_VERSION', '');
  const notice = updateNotice({
    enabled: checkForUpdates,
    current: versionData?.version,
    latest: lastVersion,
  });

  // Daemons
  const { data: daemonData } = useQuery({
    queryKey: ['daemons'],
    queryFn: getDaemons,
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });

  // Fetch all configs in one request (API has no category filter param)
  const configsQ = useQuery({
    queryKey: ['configs', 'all'],
    queryFn: () => getConfigs({ page: 1, page_size: 500 }),
    enabled: isAuthenticated,
  });
  const { data: allConfigsData, isLoading: configsLoading } = configsQ;

  const allConfigs = useMemo(() => allConfigsData?.items ?? [], [allConfigsData]);

  // Categories the rail shows, with counts; bandwidth/hidden/dynamic never,
  // x10 only while ZM_OPT_X10 is on.
  const categoryList = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const c of allConfigs) {
      countMap.set(c.category, (countMap.get(c.category) || 0) + 1);
    }
    const all = Array.from(countMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => ({ name, count }));
    return visibleCategories(all, x10Enabled);
  }, [allConfigs, x10Enabled]);

  /** Legacy-ordered tab rail (categories + sub-pages) for the classic skin. */
  const tabs = useMemo(() => buildOptionsTabs(categoryList, x10Enabled), [categoryList, x10Enabled]);

  // Selected category comes from the URL; anything not currently visible
  // (a hidden category, a typo) reads as "All" without rewriting the URL.
  const requestedCategory = typeof search.category === 'string' ? search.category : null;
  const selectedCategory =
    requestedCategory === DISPLAY_TAB || categoryList.some((c) => c.name === requestedCategory)
      ? requestedCategory
      : null;
  const [configPage, setConfigPage] = useState(1);
  const [configSearch, setConfigSearch] = useState('');

  // Filter by category then search, then paginate client-side. Only the
  // visible categories are ever listed, so "All" never leaks a hidden row.
  const filteredConfigs = useMemo(() => {
    if (selectedCategory === DISPLAY_TAB) return [];
    const visible = new Set(categoryList.map((c) => c.name));
    let result = allConfigs.filter((c) => visible.has(c.category));
    if (selectedCategory) {
      result = result.filter((c) => c.category === selectedCategory);
    }
    if (configSearch) {
      const q = configSearch.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }
    return result;
  }, [allConfigs, categoryList, selectedCategory, configSearch]);

  const configTotalPages = Math.max(1, Math.ceil(filteredConfigs.length / CONFIG_PAGE_SIZE));
  const paginatedConfigs = filteredConfigs.slice(
    (configPage - 1) * CONFIG_PAGE_SIZE,
    configPage * CONFIG_PAGE_SIZE,
  );

  const selectCategory = (cat: string | null) => {
    void navigate({
      to: '/settings',
      search: (prev: Record<string, unknown>) => {
        const next = { ...prev };
        if (cat) next.category = cat;
        else delete next.category;
        return next;
      },
      replace: true,
    });
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
    onError: (err) => toast.apiError(err),
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
    onError: (err) => toast.apiError(err),
  });

  // Inline config edit
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const configMutation = useMutation({
    mutationFn: ({ name, value }: { name: string; value: string }) => updateConfig(name, value),
    onSuccess: (_saved, { name }) => {
      setEditingConfig(null);
      setDirty((d) => {
        if (!(name in d)) return d;
        const next = { ...d };
        delete next[name];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['configs'] });
      queryClient.invalidateQueries({ queryKey: ['config', name] });
    },
    onError: (err) => toast.apiError(err),
  });

  /**
   * Legacy Options saves the whole tab at once. Rows the operator edited
   * but did not commit are kept here (name → value) so "Save all" can write
   * them in one go; each row still saves on Enter as before.
   */
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const saveAllMutation = useMutation({
    mutationFn: async (entries: Array<[string, string]>) => {
      const failed: string[] = [];
      for (const [name, value] of entries) {
        try {
          await updateConfig(name, value);
          setDirty((d) => {
            const next = { ...d };
            delete next[name];
            return next;
          });
        } catch {
          failed.push(name);
        }
      }
      return { saved: entries.length - failed.length, failed };
    },
    onSuccess: ({ saved, failed }) => {
      if (saved > 0) toast.success(t('{{count}} setting saved', { count: saved }));
      if (failed.length > 0) toast.error(t('Failed to save: {{names}}', { names: failed.join(', ') }));
      setEditingConfig(null);
      queryClient.invalidateQueries({ queryKey: ['configs'] });
      queryClient.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (err) => toast.apiError(err),
  });

  const startEdit = (name: string, currentValue: string) => {
    // Moving to another row parks the unsaved value instead of dropping it.
    if (editingConfig && editingConfig !== name) parkEdit();
    setEditingConfig(name);
    setEditValue(dirty[name] ?? currentValue);
  };
  const editingRow = editingConfig ? allConfigs.find((c) => c.name === editingConfig) ?? null : null;
  /** Pattern mismatch for the value being typed; null while valid or unchecked. */
  const editError = editingRow ? configPatternError(editingRow, editValue) : null;
  const saveEdit = (name: string) => {
    if (editError) return;
    configMutation.mutate({ name, value: editValue });
  };
  /** Keep the typed value as dirty without writing it. */
  const parkEdit = () => {
    if (!editingRow) return;
    if (editValue !== editingRow.value && !editError) {
      setDirty((d) => ({ ...d, [editingRow.name]: editValue }));
    } else if (editValue === editingRow.value) {
      setDirty((d) => {
        if (!(editingRow.name in d)) return d;
        const next = { ...d };
        delete next[editingRow.name];
        return next;
      });
    }
    setEditingConfig(null);
  };
  const cancelEdit = () => parkEdit();
  const discardDirty = (name?: string) => {
    if (name === undefined) setDirty({});
    else setDirty((d) => {
      const next = { ...d };
      delete next[name];
      return next;
    });
  };
  const dirtyEntries = Object.entries(dirty).filter(([name, value]) => {
    const row = allConfigs.find((c) => c.name === name);
    return row && row.value !== value;
  });
  const saveAll = () => {
    // Include the row currently open in the editor.
    const entries = new Map(dirtyEntries);
    if (editingRow && editValue !== editingRow.value && !editError) entries.set(editingRow.name, editValue);
    if (entries.size === 0) return;
    saveAllMutation.mutate([...entries]);
  };

  /** Write `default_value` back (legacy "reset" per row); no-op without one. */
  const resetToDefault = (config: ZmConfig) => {
    const value = configDefaultValue(config);
    if (value === null) return;
    setEditingConfig(null);
    configMutation.mutate({ name: config.name, value });
  };

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
    updateNotice: notice,
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
    configsIsError: configsQ.isError,
    configsError: configsQ.error,
    refetchConfigs: () => void configsQ.refetch(),
    categoryList,
    tabs,
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
    editError,
    resetToDefault,
    isConfigSaving: configMutation.isPending,
    configSaveError: configMutation.error?.message ?? null,
    savingConfig: configMutation.isPending ? configMutation.variables?.name ?? null : null,
    // save all dirty rows
    dirty,
    dirtyCount: dirtyEntries.length + (editingRow && editValue !== editingRow.value && !editError ? 1 : 0),
    saveAll,
    isSavingAll: saveAllMutation.isPending,
    discardDirty,
  };
}
