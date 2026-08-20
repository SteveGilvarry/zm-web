import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  Settings,
  Search,
  Cpu,
  Activity,
  Server,
  CheckCircle,
  XCircle,
  Play,
  Square,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  FileText,
  Loader2,
  Layers,
  Save,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import { humanizeIdent } from '@/features/settings/configFormat';
import { formatBytes, useSettingsOptionsPage } from '@/features/settings/useSettingsOptionsPage';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { ConfigRow } from '../components/settings/ConfigRow';
import { DaemonRow } from '../components/settings/DaemonRow';
import { LoadBar } from '../components/settings/LoadBar';
import { SkinSwitcher } from '../components/settings/SkinSwitcher';

/** Settings → Options — Mission Control. */
export default function SettingsOptionsPage() {
  const { t } = useTranslation();
  const s = useSettingsOptionsPage();
  const { can } = usePerms();
  useSiteTitle(t('Settings'));
  const { systemStatus, versionData, stats, daemons, selectedCategory, confirmAction } = s;
  const canEdit = can('system', 'Edit');

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={t('System Settings')}>
      <main className="flex-1 p-6 overflow-auto">
          <div className="mb-6">
            <SkinSwitcher />
          </div>

          <div className="grid grid-cols-12 gap-6">
            {/* Left column: System Overview + Config Editor */}
            <div className="col-span-8 space-y-6">
              {/* System Overview */}
              <Panel
                title={t('System Overview')}
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
                        {systemStatus.running ? t('Running') : t('Stopped')}
                      </span>
                    )}
                  </div>
                }
              >
                {/* Version info */}
                {versionData && (
                  <div className="flex items-center gap-4 mb-5 text-sm text-text-secondary">
                    <span>
                      {t('Version:')} <span className="font-mono text-text-primary">{versionData.version}</span>
                    </span>
                    <span>
                      {t('API:')} <span className="font-mono text-text-primary">{versionData.api_version}</span>
                    </span>
                    <span>
                      {t('DB:')} <span className="font-mono text-text-primary">{versionData.db_version}</span>
                    </span>
                  </div>
                )}

                {/* Stats bars */}
                {stats ? (
                  <div className="grid grid-cols-3 gap-6">
                    <LoadBar
                      value={stats.cpu_usage_percent}
                      label={t('CPU')}
                      detail={t('Load: {{load}}', { load: stats.cpu_load.toFixed(2) })}
                    />
                    <LoadBar
                      value={s.memoryUsedPercent}
                      label={t('Memory')}
                      detail={`${formatBytes(stats.total_mem - stats.free_mem)} / ${formatBytes(stats.total_mem)}`}
                    />
                    <LoadBar
                      value={stats.disk_usage_percent}
                      label={t('Disk')}
                      detail={`${formatBytes(stats.used_disk)} / ${formatBytes(stats.total_disk)}`}
                    />
                  </div>
                ) : (
                  <div className="text-sm text-text-muted text-center py-4">{t('Loading system stats...')}</div>
                )}
              </Panel>

              {/* ZoneMinder Configuration — split panel with category sidebar */}
              <div className="bg-surface rounded-xl border border-border-subtle shadow-panel overflow-hidden">
                {/* Panel header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
                  <div className="flex items-center gap-2">
                    <span className="text-text-muted"><Settings size={18} /></span>
                    <h3 className="font-medium text-text-primary">{t('ZoneMinder Configuration')}</h3>
                  </div>
                  {selectedCategory && (
                    <span className="text-xs text-cyan px-2 py-0.5 rounded bg-cyan/10">
                      {humanizeIdent(selectedCategory)}
                    </span>
                  )}
                </div>

                <div className="flex">
                  {/* Category sidebar */}
                  <div className="w-44 flex-shrink-0 border-e border-border-subtle bg-panel/30">
                    <div className="overflow-y-auto max-h-[600px] py-1">
                      {/* All categories option */}
                      <button
                        onClick={() => s.selectCategory(null)}
                        className={clsx(
                          'w-full flex items-center justify-between px-4 py-2 text-start text-sm',
                          'transition-colors relative',
                          selectedCategory === null
                            ? 'text-cyan bg-cyan/10'
                            : 'text-text-secondary hover:text-text-primary hover:bg-panel/50'
                        )}
                      >
                        {selectedCategory === null && (
                          <div className="absolute start-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-cyan rounded-e" />
                        )}
                        <div className="flex items-center gap-2">
                          <Layers size={13} className="flex-shrink-0 opacity-60" />
                          <span>{t('All')}</span>
                        </div>
                        <span className="text-[10px] font-mono text-text-muted">
                          {s.allConfigs.length || ''}
                        </span>
                      </button>

                      <div className="mx-3 my-1 border-t border-border-subtle" />

                      {s.categoryList.map(({ name, count }) => (
                        <button
                          key={name}
                          onClick={() => s.selectCategory(name)}
                          className={clsx(
                            'w-full flex items-center justify-between px-4 py-2 text-start text-sm',
                            'transition-colors relative',
                            selectedCategory === name
                              ? 'text-cyan bg-cyan/10'
                              : 'text-text-secondary hover:text-text-primary hover:bg-panel/50'
                          )}
                        >
                          {selectedCategory === name && (
                            <div className="absolute start-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-cyan rounded-e" />
                          )}
                          <span className="truncate">{humanizeIdent(name)}</span>
                          <span className="text-[10px] font-mono text-text-muted ms-2 flex-shrink-0">
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
                        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <input
                          type="text"
                          placeholder={
                            selectedCategory
                              ? t('Search in {{category}}...', { category: selectedCategory })
                              : t('Search all configs...')
                          }
                          value={s.configSearch}
                          onChange={(e) => s.setConfigSearch(e.target.value)}
                          className={clsx(
                            'w-full ps-10 pe-4 py-2',
                            'bg-panel border border-border-subtle rounded-lg',
                            'text-text-primary text-sm placeholder:text-text-muted',
                            'focus:outline-none focus:border-cyan/50',
                            'transition-colors'
                          )}
                        />
                      </div>
                    </div>

                    {s.configSaveError && (
                      <p role="alert" className="px-4 py-2 text-xs text-crimson border-b border-border-subtle">
                        {t('Save failed: {{message}}', { message: s.configSaveError })}
                      </p>
                    )}

                    {s.dirtyCount > 0 && (
                      <div role="status" className="flex items-center gap-3 px-4 py-2 text-xs border-b border-border-subtle bg-amber/10 text-amber">
                        <span className="flex-1">{t('{{count}} unsaved change', { count: s.dirtyCount })}</span>
                        <button
                          type="button"
                          onClick={() => s.discardDirty()}
                          className="px-2 py-1 rounded border border-border-subtle text-text-secondary hover:text-text-primary"
                        >
                          {t('Discard')}
                        </button>
                        <button
                          type="button"
                          onClick={s.saveAll}
                          disabled={s.isSavingAll}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-cyan text-void font-medium disabled:opacity-50"
                        >
                          {s.isSavingAll ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                          {t('Save all')}
                        </button>
                      </div>
                    )}

                    {/* Config table */}
                    <QueryState
                      isLoading={s.configsLoading}
                      isError={s.configsIsError}
                      error={s.configsError}
                      onRetry={s.refetchConfigs}
                      empty={s.paginatedConfigs.length === 0}
                      emptyMessage={s.configSearch ? t('No configs match your search') : t('No configs found')}
                    >
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border-subtle text-start">
                              <th className="px-4 py-2.5 font-medium text-text-muted text-xs uppercase tracking-wider">
                                {t('Name')}
                              </th>
                              <th className="px-4 py-2.5 font-medium text-text-muted text-xs uppercase tracking-wider">
                                {t('Value')}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-subtle">
                            {s.paginatedConfigs.map((config) => (
                              <ConfigRow
                                key={config.name}
                                config={canEdit ? config : { ...config, readonly: 1 }}
                                isEditing={s.editingConfig === config.name}
                                editValue={s.editValue}
                                onEditValueChange={s.setEditValue}
                                editError={s.editingConfig === config.name ? s.editError : null}
                                onStartEdit={() => s.startEdit(config.name, config.value)}
                                onSave={() => s.saveEdit(config.name)}
                                onCancel={s.cancelEdit}
                                onReset={canEdit ? () => s.resetToDefault(config) : undefined}
                                isSaving={s.savingConfig === config.name}
                                dirtyValue={s.dirty[config.name]}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </QueryState>

                    {/* Pagination */}
                    {s.configTotalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-border-subtle">
                        <span className="text-xs text-text-muted">
                          {t('Page {{page}} of {{total}} ({{count}} configs)', { page: s.configPage, total: s.configTotalPages, count: s.filteredConfigs.length })}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={s.prevConfigPage}
                            disabled={s.configPage === 1}
                            aria-label={t('Previous page')}
                            className={clsx(
                              'p-1.5 rounded-lg border transition-colors',
                              s.configPage === 1
                                ? 'border-border-subtle text-text-muted cursor-not-allowed'
                                : 'border-border-subtle text-text-primary hover:border-cyan/50'
                            )}
                          >
                            <ChevronLeft size={14} className="rtl:-scale-x-100" />
                          </button>
                          <button
                            onClick={s.nextConfigPage}
                            disabled={s.configPage === s.configTotalPages}
                            aria-label={t('Next page')}
                            className={clsx(
                              'p-1.5 rounded-lg border transition-colors',
                              s.configPage === s.configTotalPages
                                ? 'border-border-subtle text-text-muted cursor-not-allowed'
                                : 'border-border-subtle text-text-primary hover:border-cyan/50'
                            )}
                          >
                            <ChevronRight size={14} className="rtl:-scale-x-100" />
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
              <Panel title={t('System Actions')} icon={<Activity size={18} />}>
                <RequirePerm feature="system" level="Edit" fallback="message">
                <div className="space-y-3">
                  <button
                    onClick={() =>
                      s.setConfirmAction({
                        action: 'startup',
                        title: t('Start ZoneMinder'),
                        message: t('Are you sure you want to start ZoneMinder?'),
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
                    {t('Start ZoneMinder')}
                  </button>

                  <button
                    onClick={() =>
                      s.setConfirmAction({
                        action: 'shutdown',
                        title: t('Stop ZoneMinder'),
                        message: t('Are you sure you want to stop ZoneMinder? All monitoring will cease.'),
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
                    {t('Stop ZoneMinder')}
                  </button>

                  <button
                    onClick={() =>
                      s.setConfirmAction({
                        action: 'restart',
                        title: t('Restart ZoneMinder'),
                        message: t('Are you sure you want to restart ZoneMinder? There will be a brief interruption.'),
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
                    {t('Restart ZoneMinder')}
                  </button>

                  <div className="border-t border-border-subtle my-2" />

                  <button
                    onClick={() =>
                      s.setConfirmAction({
                        action: 'logrotate',
                        title: t('Rotate Logs'),
                        message: t('Rotate ZoneMinder log files?'),
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
                    {t('Rotate Logs')}
                  </button>
                </div>
                </RequirePerm>
              </Panel>

              {/* Daemon Control */}
              <Panel title={t('Daemon Control')} icon={<Cpu size={18} />}>
                {daemons.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-4">{t('No daemons configured')}</p>
                ) : (
                  <div className="space-y-2">
                    {daemons.map((daemon) => (
                      <DaemonRow
                        key={daemon.name}
                        daemon={daemon}
                        onAction={(action) => { if (canEdit) s.runDaemonAction({ name: daemon.name, action }); }}
                        isLoading={s.isDaemonActionPending || !canEdit}
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
        onClose={() => s.setConfirmAction(null)}
        onConfirm={() => confirmAction && s.runSystemAction(confirmAction.action)}
        title={confirmAction?.title || ''}
        message={confirmAction?.message || ''}
        confirmText={confirmAction?.action === 'shutdown' ? t('Stop') : t('Confirm')}
        variant={confirmAction?.action === 'shutdown' ? 'danger' : 'warning'}
        isLoading={s.isSystemActionPending}
      />
    </AppShell>
  );
}
