import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  Search,
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
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QueryState } from '@/components/common/QueryState';
import { fieldClasses } from '@/components/common/styles';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import { humanizeIdent } from '@/features/settings/configFormat';
import { formatBytes, useSettingsOptionsPage } from '@/features/settings/useSettingsOptionsPage';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { ConfigRow } from '../components/settings/ConfigRow';
import { DaemonRow } from '../components/settings/DaemonRow';
import { LoadBar } from '../components/settings/LoadBar';
import { SkinSwitcher } from '../components/settings/SkinSwitcher';

const heading = 'text-sm font-medium text-fg';
/** Full-width action row. Danger is reserved for the two that interrupt recording. */
const actionRow = 'w-full flex items-center gap-3 px-3 py-2 rounded border text-sm transition-colors';
const actionNeutral = 'border-border-subtle text-fg-muted hover:text-fg hover:border-border';
const actionDanger = 'border-danger/40 text-danger hover:bg-danger/10';
const pagerBtn = 'p-1.5 rounded border border-border-subtle transition-colors';

/**
 * Settings → Options — the modern skin.
 *
 * Five stacked panels became five sections: the hierarchy is spacing and
 * type, and the only borders left are the ones separating rows of data
 * (the config table and its category rail). The column is capped at a
 * readable measure rather than stretching label/value pairs across the
 * whole window (docs/DESIGN.md).
 */
export default function SettingsOptionsPage() {
  const { t } = useTranslation();
  const s = useSettingsOptionsPage();
  const { can } = usePerms();
  useSiteTitle(t('Settings'));
  const { systemStatus, versionData, stats, daemons, selectedCategory, confirmAction } = s;
  const canEdit = can('system', 'Edit');

  if (!s.isAuthenticated) return null;

  const railItem = (selected: boolean) =>
    clsx(
      'w-full flex items-center justify-between gap-2 px-3 py-1.5 text-start text-sm transition-colors',
      selected ? 'bg-accent/10 text-accent' : 'text-fg-muted hover:text-fg hover:bg-surface-2',
    );

  return (
    <AppShell title={t('System Settings')}>
      <main className="flex-1 p-6 overflow-auto">
        <div className="mx-auto w-full max-w-4xl space-y-10">
          <SkinSwitcher />

          {/* System overview */}
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className={heading}>{t('System Overview')}</h2>
              {systemStatus?.running !== undefined && (
                <span
                  className={clsx(
                    'inline-flex items-center gap-1.5 text-xs',
                    systemStatus.running ? 'text-ok' : 'text-danger',
                  )}
                >
                  {systemStatus.running ? <CheckCircle size={12} aria-hidden /> : <XCircle size={12} aria-hidden />}
                  {systemStatus.running ? t('Running') : t('Stopped')}
                </span>
              )}
            </div>

            {versionData && (
              <dl className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
                <div className="flex items-baseline gap-2">
                  <dt className="text-fg-dim">{t('Version:')}</dt>
                  <dd className="font-mono tabular-nums text-fg">{versionData.version}</dd>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt className="text-fg-dim">{t('API:')}</dt>
                  <dd className="font-mono tabular-nums text-fg">{versionData.api_version}</dd>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt className="text-fg-dim">{t('DB:')}</dt>
                  <dd className="font-mono tabular-nums text-fg">{versionData.db_version}</dd>
                </div>
              </dl>
            )}

            {stats ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
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
              <p className="text-sm text-fg-dim">{t('Loading system stats...')}</p>
            )}
          </section>

          {/* Configuration — the one place a border earns its keep. */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className={heading}>{t('ZoneMinder Configuration')}</h2>
              {selectedCategory && (
                <span className="text-xs text-fg-dim">{humanizeIdent(selectedCategory)}</span>
              )}
            </div>

            <div className="flex rounded border border-border-subtle overflow-hidden">
              {/* Category rail */}
              <div className="w-40 flex-shrink-0 border-e border-border-subtle">
                <div className="overflow-y-auto max-h-[600px] py-1">
                  <button onClick={() => s.selectCategory(null)} className={railItem(selectedCategory === null)}>
                    <div className="flex items-center gap-2">
                      <Layers size={13} className="flex-shrink-0" aria-hidden />
                      <span>{t('All')}</span>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-fg-dim">
                      {s.allConfigs.length || ''}
                    </span>
                  </button>

                  <div className="mx-3 my-1 border-t border-border-subtle" />

                  {s.categoryList.map(({ name, count }) => (
                    <button
                      key={name}
                      onClick={() => s.selectCategory(name)}
                      className={railItem(selectedCategory === name)}
                    >
                      <span className="truncate">{humanizeIdent(name)}</span>
                      <span className="text-xs font-mono tabular-nums text-fg-dim flex-shrink-0">
                        {count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Config content */}
              <div className="flex-1 min-w-0">
                <div className="px-4 py-2.5 border-b border-border-subtle">
                  <div className="relative">
                    <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-faint" aria-hidden />
                    <input
                      type="text"
                      placeholder={
                        selectedCategory
                          ? t('Search in {{category}}...', { category: selectedCategory })
                          : t('Search all configs...')
                      }
                      value={s.configSearch}
                      onChange={(e) => s.setConfigSearch(e.target.value)}
                      className={clsx(fieldClasses('sm'), 'ps-8')}
                    />
                  </div>
                </div>

                {s.configSaveError && (
                  <p role="alert" className="px-4 py-2 text-xs text-danger border-b border-border-subtle">
                    {t('Save failed: {{message}}', { message: s.configSaveError })}
                  </p>
                )}

                {s.dirtyCount > 0 && (
                  <div role="status" className="flex items-center gap-3 px-4 py-2 text-xs border-b border-border-subtle bg-warn/10 text-warn">
                    <span className="flex-1">{t('{{count}} unsaved change', { count: s.dirtyCount })}</span>
                    <button
                      type="button"
                      onClick={() => s.discardDirty()}
                      className="px-2 py-1 rounded border border-border-subtle text-fg-muted hover:text-fg transition-colors"
                    >
                      {t('Discard')}
                    </button>
                    <button
                      type="button"
                      onClick={s.saveAll}
                      disabled={s.isSavingAll}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-accent text-accent-fg font-medium disabled:opacity-50"
                    >
                      {s.isSavingAll ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                      {t('Save all')}
                    </button>
                  </div>
                )}

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
                          <th className="px-4 py-2 text-start text-xs font-medium text-fg-dim">
                            {t('Name')}
                          </th>
                          <th className="px-4 py-2 text-start text-xs font-medium text-fg-dim">
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

                {s.configTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-2 border-t border-border-subtle">
                    <span className="text-xs text-fg-dim tabular-nums">
                      {t('Page {{page}} of {{total}} ({{count}} configs)', { page: s.configPage, total: s.configTotalPages, count: s.filteredConfigs.length })}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={s.prevConfigPage}
                        disabled={s.configPage === 1}
                        aria-label={t('Previous page')}
                        className={clsx(pagerBtn, s.configPage === 1 ? 'text-fg-faint cursor-not-allowed' : 'text-fg hover:border-border')}
                      >
                        <ChevronLeft size={14} className="rtl:-scale-x-100" />
                      </button>
                      <button
                        onClick={s.nextConfigPage}
                        disabled={s.configPage === s.configTotalPages}
                        aria-label={t('Next page')}
                        className={clsx(pagerBtn, s.configPage === s.configTotalPages ? 'text-fg-faint cursor-not-allowed' : 'text-fg hover:border-border')}
                      >
                        <ChevronRight size={14} className="rtl:-scale-x-100" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 items-start">
            {/* System actions */}
            <section className="space-y-3">
              <h2 className={heading}>{t('System Actions')}</h2>
              <RequirePerm feature="system" level="Edit" fallback="message">
                <div className="space-y-2">
                  <button
                    onClick={() =>
                      s.setConfirmAction({
                        action: 'startup',
                        title: t('Start ZoneMinder'),
                        message: t('Are you sure you want to start ZoneMinder?'),
                      })
                    }
                    className={clsx(actionRow, actionNeutral)}
                  >
                    <Play size={14} aria-hidden />
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
                    className={clsx(actionRow, actionDanger)}
                  >
                    <Square size={14} aria-hidden />
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
                    className={clsx(actionRow, actionDanger)}
                  >
                    <RotateCcw size={14} aria-hidden />
                    {t('Restart ZoneMinder')}
                  </button>

                  <button
                    onClick={() =>
                      s.setConfirmAction({
                        action: 'logrotate',
                        title: t('Rotate Logs'),
                        message: t('Rotate ZoneMinder log files?'),
                      })
                    }
                    className={clsx(actionRow, actionNeutral)}
                  >
                    <FileText size={14} aria-hidden />
                    {t('Rotate Logs')}
                  </button>
                </div>
              </RequirePerm>
            </section>

            {/* Daemons */}
            <section className="space-y-3">
              <h2 className={heading}>{t('Daemon Control')}</h2>
              {daemons.length === 0 ? (
                <p className="text-sm text-fg-dim">{t('No daemons configured')}</p>
              ) : (
                <div className="divide-y divide-border-subtle border-y border-border-subtle">
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
            </section>
          </div>
        </div>
      </main>

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
