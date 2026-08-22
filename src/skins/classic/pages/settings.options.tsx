import { useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { HelpCircle, Loader2, RotateCcw } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { usePerms } from '@/features/auth/usePerms';
import { TypedConfigInput } from '@/features/settings/TypedConfigInput';
import { configDefaultValue, formatConfigValue, isAtDefault } from '@/features/settings/configFormat';
import { DISPLAY_TAB } from '@/features/settings/optionsTabs';
import { useSettingsOptionsPage } from '@/features/settings/useSettingsOptionsPage';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { SkinSwitcher } from '@/skins/modern/components/settings/SkinSwitcher';
import { OptionsRail } from '../components/settings/OptionsRail';
import { ClassicButton, ClassicTable, classicTd, classicTh } from '../components/settings/primitives';
import type { ZmConfig } from '@/types';

/**
 * Options — classic skin. Legacy `?view=options`: tab rail on the left, one
 * dense Name / Description / Value table per category on the right.
 */
export default function ClassicSettingsOptionsPage() {
  const { t } = useTranslation();
  const s = useSettingsOptionsPage();
  const { can } = usePerms();
  useSiteTitle(t('Options'));
  const canEdit = can('system', 'Edit');

  if (!s.isAuthenticated) return null;

  // Legacy Options opens on the Display tab; with no ?category= we do too.
  // But when the config fetch failed there are no category tabs at all, so
  // falling back to Display would hide the failure behind the skin chooser —
  // stay on the config pane and let its QueryState report the error.
  const selected = s.selectedCategory ?? (s.configsIsError ? null : DISPLAY_TAB);
  const activeKey =
    s.tabs.find((tab) => tab.kind === 'category' && tab.category === selected)?.key
      ?? (selected === DISPLAY_TAB ? DISPLAY_TAB : null);

  return (
    <AppShell title={t('Options')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl text-zinc-800 font-semibold">{t('Options')}</h1>
            <div className="text-xs text-zinc-600 flex items-center gap-3">
              {s.versionData && (
                <span>{t('Version:')} <span className="font-mono">{s.versionData.version}</span></span>
              )}
              {s.systemStatus && (
                <span className={clsx('font-semibold', s.systemStatus.running ? 'text-green-700' : 'text-red-700')}>
                  {s.systemStatus.running ? t('Running') : t('Stopped')}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-start gap-4">
            <OptionsRail
              tabs={s.tabs}
              active={activeKey}
              onSelectCategory={(key) => s.selectCategory(key)}
            />

            <div className="flex-1 min-w-0 space-y-3">
              {selected === DISPLAY_TAB ? (
                <SkinSwitcher />
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <input
                      type="search"
                      value={s.configSearch}
                      onChange={(e) => s.setConfigSearch(e.target.value)}
                      placeholder={
                        s.selectedCategory
                          ? t('Search in {{category}}...', { category: s.selectedCategory })
                          : t('Search all configs...')
                      }
                      className="w-72 px-2 py-1 text-sm bg-white border border-zinc-400 rounded-sm text-zinc-900 focus:outline-none focus:border-zinc-600"
                    />
                    {s.selectedCategory && (
                      <button
                        type="button"
                        onClick={() => s.selectCategory(null)}
                        className="text-xs text-cyan-800 hover:underline"
                      >
                        {t('All')}
                      </button>
                    )}
                    <span className="ms-auto text-xs text-zinc-500">
                      {t('{{count}} config', { count: s.filteredConfigs.length })}
                    </span>
                    {canEdit && (
                      <ClassicButton
                        tone="primary"
                        onClick={s.saveAll}
                        disabled={s.dirtyCount === 0 || s.isSavingAll}
                        title={t('Write every row edited on this page')}
                      >
                        {s.isSavingAll ? t('Saving…') : s.dirtyCount > 0 ? t('Save ({{count}})', { count: s.dirtyCount }) : t('Save')}
                      </ClassicButton>
                    )}
                  </div>

                  {s.configSaveError && (
                    <p role="alert" className="text-xs text-red-700">
                      {t('Save failed: {{message}}', { message: s.configSaveError })}
                    </p>
                  )}

                  {selected === 'version' && s.versionData && (
                    <ClassicTable aria-label={t('Versions')}>
                      <tbody>
                        <tr><th scope="row" className={clsx(classicTh, 'w-[28%]')}>{t('ZoneMinder version')}</th><td className={clsx(classicTd, 'font-mono text-xs')}>{s.versionData.version}</td></tr>
                        <tr><th scope="row" className={classicTh}>{t('API version')}</th><td className={clsx(classicTd, 'font-mono text-xs')}>{s.versionData.api_version}</td></tr>
                        <tr><th scope="row" className={classicTh}>{t('Database version')}</th><td className={clsx(classicTd, 'font-mono text-xs')}>{s.versionData.db_version}</td></tr>
                      </tbody>
                    </ClassicTable>
                  )}

                  <QueryState
                    isLoading={s.configsLoading}
                    isError={s.configsIsError}
                    error={s.configsError}
                    onRetry={s.refetchConfigs}
                    empty={s.paginatedConfigs.length === 0}
                    emptyMessage={s.configSearch ? t('No configs match your search') : t('No configs found')}
                  >
                    <ClassicTable>
                      <thead>
                        <tr>
                          <th className={clsx(classicTh, 'w-[28%]')}>{t('Name')}</th>
                          <th className={classicTh}>{t('Description')}</th>
                          <th className={clsx(classicTh, 'w-[30%]')}>{t('Value')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.paginatedConfigs.map((config) => (
                          <ClassicConfigRow
                            key={config.name}
                            config={canEdit ? config : { ...config, readonly: 1 }}
                            isEditing={s.editingConfig === config.name}
                            editValue={s.editValue}
                            editError={s.editingConfig === config.name ? s.editError : null}
                            onEditValueChange={s.setEditValue}
                            onStartEdit={() => s.startEdit(config.name, config.value)}
                            onSave={() => s.saveEdit(config.name)}
                            onCancel={s.cancelEdit}
                            onReset={() => s.resetToDefault(config)}
                            isSaving={s.savingConfig === config.name}
                            dirtyValue={s.dirty[config.name]}
                          />
                        ))}
                      </tbody>
                    </ClassicTable>
                  </QueryState>

                  {s.configTotalPages > 1 && (
                    <div className="flex items-center justify-between text-xs text-zinc-600">
                      <span>
                        {t('Page {{page}} of {{total}} ({{count}} configs)', {
                          page: s.configPage, total: s.configTotalPages, count: s.filteredConfigs.length,
                        })}
                      </span>
                      <span className="flex items-center gap-2">
                        <button
                          onClick={s.prevConfigPage}
                          disabled={s.configPage === 1}
                          className="px-2 py-0.5 border border-zinc-400 rounded-sm bg-white disabled:opacity-40"
                        >
                          {t('Prev')}
                        </button>
                        <button
                          onClick={s.nextConfigPage}
                          disabled={s.configPage === s.configTotalPages}
                          className="px-2 py-0.5 border border-zinc-400 rounded-sm bg-white disabled:opacity-40"
                        >
                          {t('Next')}
                        </button>
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}

function ClassicConfigRow({
  config,
  isEditing,
  editValue,
  editError,
  onEditValueChange,
  onStartEdit,
  onSave,
  onCancel,
  onReset,
  isSaving,
  dirtyValue,
}: {
  config: ZmConfig;
  isEditing: boolean;
  editValue: string;
  editError: string | null;
  onEditValueChange: (v: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onReset: () => void;
  isSaving: boolean;
  dirtyValue?: string;
}) {
  const { t } = useTranslation();
  const [showHelp, setShowHelp] = useState(false);
  const isReadonly = config.readonly === 1;
  const isSecret = config.private === 1 || config.type === 'password';
  const canReset = !isReadonly && !isAtDefault(config);

  return (
    <>
      <tr className={clsx('align-top', dirtyValue !== undefined && 'bg-amber-50')}>
        <td className="px-3 py-2 font-mono text-xs text-zinc-700 border-b border-zinc-200">
          {config.name}
          {isReadonly && <span className="ms-1 text-[10px] text-zinc-400">({t('read-only')})</span>}
        </td>
        <td className="px-3 py-2 text-xs text-zinc-700 border-b border-zinc-200">
          <span>{config.prompt}</span>
          {config.help && (
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              aria-expanded={showHelp}
              aria-label={showHelp ? t('Hide help') : t('Show help')}
              className="ms-1 inline-flex align-middle text-cyan-800 hover:text-cyan-900"
            >
              <HelpCircle size={12} />
            </button>
          )}
          {showHelp && config.help && (
            <p className="mt-1 text-[11px] text-zinc-500 whitespace-pre-line">{config.help.trim()}</p>
          )}
        </td>
        <td className="px-3 py-2 border-b border-zinc-200">
          {isEditing ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <TypedConfigInput
                  config={config}
                  value={editValue}
                  onChange={onEditValueChange}
                  onCommit={onSave}
                  onCancel={onCancel}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={onSave}
                  disabled={isSaving || !!editError}
                  className="px-2 py-0.5 text-xs border border-zinc-500 rounded-sm bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40"
                >
                  {isSaving ? <Loader2 size={12} className="animate-spin" /> : t('Save')}
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-2 py-0.5 text-xs border border-zinc-400 rounded-sm bg-white hover:bg-zinc-100"
                >
                  {t('Cancel')}
                </button>
              </div>
              {editError && <p role="alert" className="text-[11px] text-red-700">{editError}</p>}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span
                onClick={isReadonly ? undefined : onStartEdit}
                title={isSecret ? undefined : (dirtyValue ?? config.value)}
                className={clsx(
                  'font-mono text-xs truncate max-w-[22rem]',
                  isReadonly ? 'text-zinc-500' : 'cursor-pointer text-zinc-900 hover:underline',
                )}
              >
                {dirtyValue !== undefined
                  ? (isSecret ? '••••••••' : formatConfigValue({ ...config, value: dirtyValue }))
                  : config.value
                    ? (isSecret ? '••••••••' : formatConfigValue(config))
                    : <span className="italic text-zinc-400">{t('empty')}</span>}
              </span>
              {dirtyValue !== undefined && <span className="text-[10px] text-amber-700">({t('unsaved')})</span>}
              {canReset && (
                <button
                  type="button"
                  onClick={onReset}
                  disabled={isSaving}
                  aria-label={t('Reset {{name}} to default', { name: config.name })}
                  title={t('Reset to default ({{value}})', { value: isSecret ? '••••' : configDefaultValue(config) })}
                  className="text-zinc-400 hover:text-amber-700"
                >
                  {isSaving ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                </button>
              )}
            </div>
          )}
        </td>
      </tr>
    </>
  );
}
