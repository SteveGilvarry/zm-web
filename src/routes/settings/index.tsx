import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  Settings,
  Search,
  Cpu,
  Activity,
  Server,
  CheckCircle,
  XCircle,
  AlertCircle,
  Play,
  Square,
  RotateCcw,
  Lock,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Save,
  FileText,
  Loader2,
  Layers,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
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
import { useUiStore, type Skin } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import type { DaemonStatus, ZmConfig } from '@/types';

export const Route = createFileRoute('/settings/')({
  component: SettingsPage,
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function LoadBar({ value, label, detail }: { value: number; label: string; detail?: string }) {
  const percent = Math.min(value, 100);
  const color = percent > 90 ? 'bg-crimson' : percent > 70 ? 'bg-amber' : 'bg-cyan';
  const textColor = percent > 90 ? 'text-crimson' : percent > 70 ? 'text-amber' : 'text-text-secondary';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">{label}</span>
        <span className={clsx('text-sm font-mono', textColor)}>{percent.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-border overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-slow', color)}
          style={{ width: `${percent}%` }}
        />
      </div>
      {detail && <p className="text-xs text-text-muted">{detail}</p>}
    </div>
  );
}

function SettingsPage() {
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

  const allConfigs = allConfigsData?.items || [];

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
  const configPageSize = 50;

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

  const configTotalPages = Math.max(1, Math.ceil(filteredConfigs.length / configPageSize));
  const paginatedConfigs = filteredConfigs.slice(
    (configPage - 1) * configPageSize,
    configPage * configPageSize
  );

  const handleCategorySelect = (cat: string | null) => {
    setSelectedCategory(cat);
    setConfigPage(1);
    setConfigSearch('');
  };

  // System action confirm dialogs
  const [confirmAction, setConfirmAction] = useState<{
    action: 'startup' | 'shutdown' | 'restart' | 'logrotate';
    title: string;
    message: string;
  } | null>(null);

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
    mutationFn: async ({ name, action }: { name: string; action: 'start' | 'stop' | 'restart' }) => {
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

  const stats = systemStatus?.stats;
  const daemons = daemonData?.daemons || [];
  const memoryUsedPercent =
    stats && stats.total_mem > 0
      ? ((stats.total_mem - stats.free_mem) / stats.total_mem) * 100
      : 0;

  if (!isAuthenticated) return null;

  return (
    <AppShell title="System Settings">
      <main className="flex-1 p-6 overflow-auto">
          <div className="mb-6">
            <SkinSwitcher />
          </div>

          <div className="grid grid-cols-12 gap-6">
            {/* Left column: System Overview + Config Editor */}
            <div className="col-span-8 space-y-6">
              {/* System Overview */}
              <Panel
                title="System Overview"
                icon={<Server size={18} />}
                action={
                  <div className="flex items-center gap-2">
                    {systemStatus?.running !== undefined && (
                      <span
                        className={clsx(
                          'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium',
                          systemStatus.running
                            ? 'bg-emerald/20 text-emerald'
                            : 'bg-crimson/20 text-crimson'
                        )}
                      >
                        {systemStatus.running ? (
                          <CheckCircle size={12} />
                        ) : (
                          <XCircle size={12} />
                        )}
                        {systemStatus.running ? 'Running' : 'Stopped'}
                      </span>
                    )}
                  </div>
                }
              >
                {/* Version info */}
                {versionData && (
                  <div className="flex items-center gap-4 mb-5 text-sm text-text-secondary">
                    <span>
                      Version: <span className="font-mono text-text-primary">{versionData.version}</span>
                    </span>
                    <span>
                      API: <span className="font-mono text-text-primary">{versionData.api_version}</span>
                    </span>
                  </div>
                )}

                {/* Stats bars */}
                {stats ? (
                  <div className="grid grid-cols-3 gap-6">
                    <LoadBar
                      value={stats.cpu_usage_percent}
                      label="CPU"
                      detail={`Load: ${stats.cpu_load.toFixed(2)}`}
                    />
                    <LoadBar
                      value={memoryUsedPercent}
                      label="Memory"
                      detail={`${formatBytes(stats.total_mem - stats.free_mem)} / ${formatBytes(stats.total_mem)}`}
                    />
                    <LoadBar
                      value={stats.disk_usage_percent}
                      label="Disk"
                      detail={`${formatBytes(stats.used_disk)} / ${formatBytes(stats.total_disk)}`}
                    />
                  </div>
                ) : (
                  <div className="text-sm text-text-muted text-center py-4">Loading system stats...</div>
                )}
              </Panel>

              {/* ZoneMinder Configuration — split panel with category sidebar */}
              <div className="bg-surface rounded-xl border border-border-subtle shadow-panel overflow-hidden">
                {/* Panel header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
                  <div className="flex items-center gap-2">
                    <span className="text-text-muted"><Settings size={18} /></span>
                    <h3 className="font-medium text-text-primary">ZoneMinder Configuration</h3>
                  </div>
                  {selectedCategory && (
                    <span className="text-xs font-mono text-cyan px-2 py-0.5 rounded bg-cyan/10">
                      {selectedCategory}
                    </span>
                  )}
                </div>

                <div className="flex">
                  {/* Category sidebar */}
                  <div className="w-44 flex-shrink-0 border-r border-border-subtle bg-panel/30">
                    <div className="overflow-y-auto max-h-[600px] py-1">
                      {/* All categories option */}
                      <button
                        onClick={() => handleCategorySelect(null)}
                        className={clsx(
                          'w-full flex items-center justify-between px-4 py-2 text-left text-sm',
                          'transition-colors relative',
                          selectedCategory === null
                            ? 'text-cyan bg-cyan/10'
                            : 'text-text-secondary hover:text-text-primary hover:bg-panel/50'
                        )}
                      >
                        {selectedCategory === null && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-cyan rounded-r" />
                        )}
                        <div className="flex items-center gap-2">
                          <Layers size={13} className="flex-shrink-0 opacity-60" />
                          <span>All</span>
                        </div>
                        <span className="text-[10px] font-mono text-text-muted">
                          {allConfigs.length || ''}
                        </span>
                      </button>

                      <div className="mx-3 my-1 border-t border-border-subtle" />

                      {categoryList.map(({ name, count }) => (
                        <button
                          key={name}
                          onClick={() => handleCategorySelect(name)}
                          className={clsx(
                            'w-full flex items-center justify-between px-4 py-2 text-left text-sm',
                            'transition-colors relative',
                            selectedCategory === name
                              ? 'text-cyan bg-cyan/10'
                              : 'text-text-secondary hover:text-text-primary hover:bg-panel/50'
                          )}
                        >
                          {selectedCategory === name && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-cyan rounded-r" />
                          )}
                          <span className="truncate">{name}</span>
                          <span className="text-[10px] font-mono text-text-muted ml-2 flex-shrink-0">
                            {count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Config content area */}
                  <div className="flex-1 min-w-0">
                    {/* Search bar */}
                    <div className="px-4 py-3 border-b border-border-subtle">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <input
                          type="text"
                          placeholder={
                            selectedCategory
                              ? `Search in ${selectedCategory}...`
                              : 'Search all configs...'
                          }
                          value={configSearch}
                          onChange={(e) => setConfigSearch(e.target.value)}
                          className={clsx(
                            'w-full pl-10 pr-4 py-2',
                            'bg-panel border border-border-subtle rounded-lg',
                            'text-text-primary text-sm placeholder:text-text-muted',
                            'focus:outline-none focus:border-cyan/50',
                            'transition-colors'
                          )}
                        />
                      </div>
                    </div>

                    {/* Config table */}
                    {configsLoading ? (
                      <div className="p-8 text-center text-text-muted text-sm">
                        <Loader2 size={20} className="animate-spin mx-auto mb-2 text-cyan/50" />
                        Loading configurations...
                      </div>
                    ) : paginatedConfigs.length === 0 ? (
                      <div className="p-8 text-center text-text-muted text-sm">
                        <Settings size={24} className="mx-auto mb-2 opacity-30" />
                        {configSearch ? 'No configs match your search' : 'No configs found'}
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border-subtle text-left">
                              <th className="px-4 py-2.5 font-medium text-text-muted text-xs uppercase tracking-wider">
                                Name
                              </th>
                              <th className="px-4 py-2.5 font-medium text-text-muted text-xs uppercase tracking-wider">
                                Value
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-subtle">
                            {paginatedConfigs.map((config) => (
                              <ConfigRow
                                key={config.name}
                                config={config}
                                isEditing={editingConfig === config.name}
                                editValue={editValue}
                                onEditValueChange={setEditValue}
                                onStartEdit={() => startEdit(config.name, config.value)}
                                onSave={() => saveEdit(config.name)}
                                onCancel={() => setEditingConfig(null)}
                                isSaving={
                                  configMutation.isPending && editingConfig === config.name
                                }
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Pagination */}
                    {configTotalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-border-subtle">
                        <span className="text-xs text-text-muted">
                          Page {configPage} of {configTotalPages} ({filteredConfigs.length} configs)
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setConfigPage((p) => Math.max(1, p - 1))}
                            disabled={configPage === 1}
                            className={clsx(
                              'p-1.5 rounded-lg border transition-colors',
                              configPage === 1
                                ? 'border-border-subtle text-text-muted cursor-not-allowed'
                                : 'border-border-subtle text-text-primary hover:border-cyan/50'
                            )}
                          >
                            <ChevronLeft size={14} />
                          </button>
                          <button
                            onClick={() =>
                              setConfigPage((p) => Math.min(configTotalPages, p + 1))
                            }
                            disabled={configPage === configTotalPages}
                            className={clsx(
                              'p-1.5 rounded-lg border transition-colors',
                              configPage === configTotalPages
                                ? 'border-border-subtle text-text-muted cursor-not-allowed'
                                : 'border-border-subtle text-text-primary hover:border-cyan/50'
                            )}
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right column: System Actions + Daemon Control */}
            <div className="col-span-4 space-y-6">
              {/* System Actions */}
              <Panel title="System Actions" icon={<Activity size={18} />}>
                <div className="space-y-3">
                  <button
                    onClick={() =>
                      setConfirmAction({
                        action: 'startup',
                        title: 'Start ZoneMinder',
                        message: 'Are you sure you want to start ZoneMinder?',
                      })
                    }
                    className={clsx(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-lg',
                      'bg-emerald/10 border border-emerald/20',
                      'text-emerald hover:bg-emerald/20',
                      'transition-colors text-sm font-medium'
                    )}
                  >
                    <Play size={16} />
                    Start ZoneMinder
                  </button>

                  <button
                    onClick={() =>
                      setConfirmAction({
                        action: 'shutdown',
                        title: 'Stop ZoneMinder',
                        message:
                          'Are you sure you want to stop ZoneMinder? All monitoring will cease.',
                      })
                    }
                    className={clsx(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-lg',
                      'bg-crimson/10 border border-crimson/20',
                      'text-crimson hover:bg-crimson/20',
                      'transition-colors text-sm font-medium'
                    )}
                  >
                    <Square size={16} />
                    Stop ZoneMinder
                  </button>

                  <button
                    onClick={() =>
                      setConfirmAction({
                        action: 'restart',
                        title: 'Restart ZoneMinder',
                        message:
                          'Are you sure you want to restart ZoneMinder? There will be a brief interruption.',
                      })
                    }
                    className={clsx(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-lg',
                      'bg-amber/10 border border-amber/20',
                      'text-amber hover:bg-amber/20',
                      'transition-colors text-sm font-medium'
                    )}
                  >
                    <RotateCcw size={16} />
                    Restart ZoneMinder
                  </button>

                  <div className="border-t border-border-subtle my-2" />

                  <button
                    onClick={() =>
                      setConfirmAction({
                        action: 'logrotate',
                        title: 'Rotate Logs',
                        message: 'Rotate ZoneMinder log files?',
                      })
                    }
                    className={clsx(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-lg',
                      'bg-panel border border-border-subtle',
                      'text-text-secondary hover:text-text-primary hover:border-cyan/50',
                      'transition-colors text-sm font-medium'
                    )}
                  >
                    <FileText size={16} />
                    Rotate Logs
                  </button>
                </div>
              </Panel>

              {/* Daemon Control */}
              <Panel title="Daemon Control" icon={<Cpu size={18} />}>
                {daemons.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-4">No daemons configured</p>
                ) : (
                  <div className="space-y-2">
                    {daemons.map((daemon) => (
                      <DaemonRow
                        key={daemon.name}
                        daemon={daemon}
                        onAction={(action) =>
                          daemonMutation.mutate({ name: daemon.name, action })
                        }
                        isLoading={daemonMutation.isPending}
                      />
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>
      </main>

      {/* Confirm dialog */}
      <ConfirmDialog
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => confirmAction && systemMutation.mutate(confirmAction.action)}
        title={confirmAction?.title || ''}
        message={confirmAction?.message || ''}
        confirmText={confirmAction?.action === 'shutdown' ? 'Stop' : 'Confirm'}
        variant={confirmAction?.action === 'shutdown' ? 'danger' : 'warning'}
        isLoading={systemMutation.isPending}
      />
    </AppShell>
  );
}

function ConfigRow({
  config,
  isEditing,
  editValue,
  onEditValueChange,
  onStartEdit,
  onSave,
  onCancel,
  isSaving,
}: {
  config: ZmConfig;
  isEditing: boolean;
  editValue: string;
  onEditValueChange: (v: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isReadonly = config.readonly === 1;

  return (
    <>
      <tr className="group hover:bg-panel/50 transition-colors">
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            {config.help && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
              >
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            )}
            {!config.help && <span className="w-3" />}
            <span className="font-mono text-text-primary text-xs">{config.name}</span>
            {isReadonly && <Lock size={11} className="text-text-muted flex-shrink-0" />}
          </div>
        </td>
        <td className="px-4 py-2.5">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editValue}
                onChange={(e) => onEditValueChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSave();
                  if (e.key === 'Escape') onCancel();
                }}
                autoFocus
                className={clsx(
                  'flex-1 px-2 py-1 text-xs font-mono',
                  'bg-panel border border-cyan/50 rounded',
                  'text-text-primary',
                  'focus:outline-none focus:ring-1 focus:ring-cyan/30'
                )}
              />
              <button
                onClick={onSave}
                disabled={isSaving}
                className="p-1 rounded text-cyan hover:bg-cyan/20 transition-colors"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              </button>
            </div>
          ) : (
            <span
              onClick={isReadonly ? undefined : onStartEdit}
              className={clsx(
                'text-xs font-mono block truncate max-w-[400px]',
                isReadonly
                  ? 'text-text-muted'
                  : 'text-text-secondary cursor-pointer hover:text-cyan transition-colors'
              )}
              title={config.value}
            >
              {config.value || <span className="italic text-text-muted">empty</span>}
            </span>
          )}
        </td>
      </tr>
      {expanded && config.help && (
        <tr>
          <td colSpan={2} className="px-4 py-2 bg-panel/30">
            <p className="text-xs text-text-muted pl-5">{config.help}</p>
          </td>
        </tr>
      )}
    </>
  );
}

function DaemonRow({
  daemon,
  onAction,
  isLoading,
}: {
  daemon: DaemonStatus;
  onAction: (action: 'start' | 'stop' | 'restart') => void;
  isLoading: boolean;
}) {
  const StatusIcon =
    daemon.status === 'running' ? CheckCircle : daemon.status === 'stopped' ? XCircle : AlertCircle;
  const statusColor =
    daemon.status === 'running' ? 'text-emerald' : daemon.status === 'stopped' ? 'text-crimson' : 'text-amber';

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-panel/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <StatusIcon size={14} className={statusColor} />
        <span className="text-sm font-mono text-text-secondary truncate">{daemon.name}</span>
      </div>
      <div className="flex items-center gap-1">
        {daemon.status !== 'running' && (
          <button
            onClick={() => onAction('start')}
            disabled={isLoading}
            className="p-1.5 rounded text-emerald hover:bg-emerald/20 transition-colors"
            title="Start"
          >
            <Play size={12} />
          </button>
        )}
        {daemon.status === 'running' && (
          <button
            onClick={() => onAction('stop')}
            disabled={isLoading}
            className="p-1.5 rounded text-crimson hover:bg-crimson/20 transition-colors"
            title="Stop"
          >
            <Square size={12} />
          </button>
        )}
        <button
          onClick={() => onAction('restart')}
          disabled={isLoading}
          className="p-1.5 rounded text-amber hover:bg-amber/20 transition-colors"
          title="Restart"
        >
          <RotateCcw size={12} />
        </button>
      </div>
    </div>
  );
}

function SkinSwitcher() {
  const skin = useUiStore((s) => s.skin);
  const setSkin = useUiStore((s) => s.setSkin);

  const option = (value: Skin, label: string, blurb: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setSkin(value)}
      className={clsx(
        'flex-1 text-left p-4 rounded-lg border transition-colors',
        skin === value
          ? 'bg-cyan/10 border-cyan/40 text-text-primary'
          : 'bg-surface/50 border-border-subtle text-text-muted hover:border-text-muted/50 hover:text-text-primary',
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={clsx(
            'w-2 h-2 rounded-full',
            skin === value ? 'bg-cyan' : 'bg-border',
          )}
        />
        <span className="font-medium">{label}</span>
        {skin === value && (
          <span className="ml-auto text-[10px] font-mono text-cyan">ACTIVE</span>
        )}
      </div>
      <div className="text-xs text-text-muted">{blurb}</div>
    </button>
  );

  return (
    <Panel title="Appearance" icon={<Server size={18} />}>
      <div className="flex flex-col sm:flex-row gap-3">
        {option(
          'modern',
          'Mission Control',
          'The next-generation dashboard — adaptive layouts, live thumbnails, dark cyan accents.',
        )}
        {option(
          'classic',
          'Classic ZoneMinder',
          'Faithful to the legacy ZM layout — top nav and dense tables. For operators migrating from the old interface.',
        )}
      </div>
    </Panel>
  );
}
