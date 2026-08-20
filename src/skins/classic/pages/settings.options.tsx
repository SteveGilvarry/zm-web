import { useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { HelpCircle, Loader2, RotateCcw } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { TypedConfigInput } from '@/features/settings/TypedConfigInput';
import { configDefaultValue, formatConfigValue, isAtDefault } from '@/features/settings/configFormat';
import { DISPLAY_TAB } from '@/features/settings/optionsTabs';
import { useSettingsOptionsPage } from '@/features/settings/useSettingsOptionsPage';
import { SkinSwitcher } from '@/skins/modern/components/settings/SkinSwitcher';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { OptionsRail } from '../components/settings/OptionsRail';
import type { ZmConfig } from '@/types';

/**
 * Options — classic skin. Legacy `?view=options`: tab rail on the left, one
 * dense Name / Description / Value table per category on the right.
 */
export default function ClassicSettingsOptionsPage() {
  const { t } = useTranslation();
  const s = useSettingsOptionsPage();
  useDocumentTitle(t('Options'));

  if (!s.isAuthenticated) return null;

  const activeKey = s.selectedCategory === null
    ? null
    : s.tabs.find((tab) => tab.kind === 'category' && tab.category === s.selectedCategory)?.key
      ?? (s.selectedCategory === DISPLAY_TAB ? DISPLAY_TAB : null);

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
              {s.selectedCategory === DISPLAY_TAB ? (
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
                  </div>

                  {s.configSaveError && (
                    <p role="alert" className="text-xs text-red-700">
                      {t('Save failed: {{message}}', { message: s.configSaveError })}
                    </p>
                  )}

                  <div className="bg-white rounded border border-zinc-300 overflow-hidden">
                    {s.configsLoading ? (
                      <div className="p-8 text-center text-zinc-500 text-sm">{t('Loading configurations...')}</div>
                    ) : s.paginatedConfigs.length === 0 ? (
                      <div className="p-8 text-center text-zinc-500 text-sm">
                        {s.configSearch ? t('No configs match your search') : t('No configs found')}
                      </div>
                    ) : (
                      <table className="w-full text-sm text-zinc-800">
                        <thead className="bg-zinc-100 border-b border-zinc-300 text-xs">
                          <tr>
                            <th className="px-3 py-2 text-start font-semibold w-[28%]">{t('Name')}</th>
                            <th className="px-3 py-2 text-start font-semibold">{t('Description')}</th>
                            <th className="px-3 py-2 text-start font-semibold w-[30%]">{t('Value')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.paginatedConfigs.map((config) => (
                            <ClassicConfigRow
                              key={config.name}
                              config={config}
                              isEditing={s.editingConfig === config.name}
                              editValue={s.editValue}
                              editError={s.editingConfig === config.name ? s.editError : null}
                              onEditValueChange={s.setEditValue}
                              onStartEdit={() => s.startEdit(config.name, config.value)}
                              onSave={() => s.saveEdit(config.name)}
                              onCancel={s.cancelEdit}
                              onReset={() => s.resetToDefault(config)}
                              isSaving={s.savingConfig === config.name}
                            />
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

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
}) {
  const { t } = useTranslation();
  const [showHelp, setShowHelp] = useState(false);
  const isReadonly = config.readonly === 1;
  const isSecret = config.private === 1 || config.type === 'password';
  const canReset = !isReadonly && !isAtDefault(config);

  return (
    <>
      <tr className="border-b border-zinc-200 hover:bg-zinc-50 align-top">
        <td className="px-3 py-2 font-mono text-xs text-zinc-700">
          {config.name}
          {isReadonly && <span className="ms-1 text-[10px] text-zinc-400">({t('read-only')})</span>}
        </td>
        <td className="px-3 py-2 text-xs text-zinc-700">
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
        <td className="px-3 py-2">
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
                title={isSecret ? undefined : config.value}
                className={clsx(
                  'font-mono text-xs truncate max-w-[22rem]',
                  isReadonly ? 'text-zinc-500' : 'cursor-pointer text-zinc-900 hover:underline',
                )}
              >
                {config.value
                  ? (isSecret ? '••••••••' : formatConfigValue(config))
                  : <span className="italic text-zinc-400">{t('empty')}</span>}
              </span>
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
