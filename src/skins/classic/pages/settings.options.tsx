import { useState, type FormEvent } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

import { AppShell } from '@/skins/AppShell';
import { Modal } from '@/components/common/Modal';
import { QueryState } from '@/components/common/QueryState';
import { usePerms } from '@/features/auth/usePerms';
import { TypedConfigInput } from '@/features/settings/TypedConfigInput';
import { DEFAULT_OPTIONS_TAB, DISPLAY_TAB } from '@/features/settings/optionsTabs';
import { useSettingsOptionsPage } from '@/features/settings/useSettingsOptionsPage';
import { configFileValue, isFileSet } from '@/features/settings/configRequires';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { skins, useSkin } from '@/skins/registry';
import type { SkinId } from '@/skins/types';
import { useUiStore } from '@/stores/ui';
import { OptionsRail } from '../components/settings/OptionsRail';
import { ClassicButton, ClassicTable, classicInput, classicTd, classicTh } from '../components/settings/primitives';
import type { ZmConfig } from '@/types';

/**
 * Options — classic skin, legacy `?view=options`: the tab rail on the
 * left and, for a config tab, one form with a single Save at the top and
 * every option drawn in place (`options.php:249-383`): the name without
 * `ZM_` as the label, the input, then the prompt and a "(?)" help link.
 * Opens on System, as legacy does.
 */
export default function ClassicSettingsOptionsPage() {
  const { t } = useTranslation();
  const s = useSettingsOptionsPage({ defaultCategory: DEFAULT_OPTIONS_TAB });
  const { can } = usePerms();
  useSiteTitle(t('Options'));
  const canEdit = can('system', 'Edit');
  const [help, setHelp] = useState<ZmConfig | null>(null);

  if (!s.isAuthenticated) return null;

  const selected = s.selectedCategory;
  const activeKey =
    s.tabs.find((tab) => tab.kind === 'category' && tab.category === selected)?.key
      ?? (selected === DISPLAY_TAB ? DISPLAY_TAB : null);
  const hasErrors = Object.keys(s.draftErrors).length > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canEdit) s.saveAll();
  };

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
                <ClassicThisSession />
              ) : (
                <>
                  {selected === 'version' && s.versionData && (
                    <ClassicTable aria-label={t('Versions')}>
                      <tbody>
                        <tr><th scope="row" className={clsx(classicTh, 'w-[28%]')}>{t('ZoneMinder version')}</th><td className={clsx(classicTd, 'font-mono text-xs')}>{s.versionData.version}</td></tr>
                        <tr><th scope="row" className={classicTh}>{t('API version')}</th><td className={clsx(classicTd, 'font-mono text-xs')}>{s.versionData.api_version}</td></tr>
                        <tr><th scope="row" className={classicTh}>{t('Database version')}</th><td className={clsx(classicTd, 'font-mono text-xs')}>{s.versionData.db_version}</td></tr>
                      </tbody>
                    </ClassicTable>
                  )}
                  {selected === 'version' && s.updateNotice && (
                    <p role="status" className="mt-2 px-3 py-2 border border-amber-300 bg-amber-50 text-amber-900 text-sm">
                      {t('ZoneMinder {{latest}} is available. This system runs {{current}}.', {
                        latest: s.updateNotice.latest,
                        current: s.updateNotice.current,
                      })}
                    </p>
                  )}

                  <form onSubmit={submit} aria-label={t('Options')} className="bg-white border border-zinc-300 rounded-sm">
                    <div className="flex items-center justify-end gap-2 px-3 py-2 border-b border-zinc-200">
                      {s.dirtyCount > 0 && (
                        <span role="status" className="text-xs text-amber-800">
                          {t('{{count}} unsaved change', { count: s.dirtyCount })}
                        </span>
                      )}
                      <ClassicButton
                        tone="primary"
                        type="submit"
                        disabled={!canEdit || s.isSavingAll || hasErrors}
                      >
                        {s.isSavingAll ? t('Saving…') : t('Save')}
                      </ClassicButton>
                    </div>

                    {s.configSaveError && (
                      <p role="alert" className="px-3 py-2 text-xs text-red-700">
                        {t('Save failed: {{message}}', { message: s.configSaveError })}
                      </p>
                    )}

                    <QueryState
                      isLoading={s.configsLoading}
                      isError={s.configsIsError}
                      error={s.configsError}
                      onRetry={s.refetchConfigs}
                      empty={s.filteredConfigs.length === 0}
                      emptyMessage={t('There are no config entries for category {{category}}.', { category: selected ?? '' })}
                    >
                      <div className="py-2">
                        {s.filteredConfigs.map((config) => (
                          <ClassicOptionRow
                            key={config.name}
                            config={config}
                            canEdit={canEdit}
                            locked={s.lockOf(config, canEdit) !== null}
                            value={s.draftValue(config)}
                            onChange={(v) => s.setDraft(config.name, v)}
                            error={s.draftErrors[config.name] ?? null}
                            dirty={config.name in s.dirty}
                            onHelp={() => setHelp(config)}
                          />
                        ))}
                      </div>
                    </QueryState>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      <Modal isOpen={help !== null} onClose={() => setHelp(null)} title={help?.name ?? ''}>
        <p className="text-sm text-zinc-800 whitespace-pre-line">{(help?.help || help?.prompt || '').trim()}</p>
        <div className="flex justify-end pt-4">
          <ClassicButton onClick={() => setHelp(null)}>{t('Close')}</ClassicButton>
        </div>
      </Modal>
    </AppShell>
  );
}

/** One `form-group form-row`: short name label, input, prompt + "(?)". */
function ClassicOptionRow({
  config, canEdit, locked, value, onChange, error, dirty, onHelp,
}: {
  config: ZmConfig;
  canEdit: boolean;
  /** No System=Edit, a System row, set in a conf file, or Requires unmet. */
  locked: boolean;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  dirty: boolean;
  onHelp: () => void;
}) {
  const { t } = useTranslation();
  const shortName = config.name.replace(/^ZM_/, '');
  // A Private value (ZM_AUTH_HASH_SECRET…) is only for those who may change
  // it (`options.php:274-278`, GHSA-7g3f-93q8-fhwj).
  const valueHidden = config.private === 1 && !canEdit;
  // Set in zm.conf or conf.d (`options.php:280-282, 373-376`): the value in
  // effect, read-only, and a note naming the file. A secret never shows.
  const fileSet = isFileSet(config);
  const secret = config.private === 1 || config.type === 'password';
  const shown = fileSet
    ? (secret ? '<set in config file>' : configFileValue(config.value, config.type))
    : valueHidden ? '' : value;

  return (
    <div className={clsx('grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-x-4 gap-y-1 px-3 py-1.5', dirty && 'bg-amber-50')}>
      <label htmlFor={config.name} className="md:text-end text-sm font-semibold text-zinc-800 md:pt-1 break-all">
        {shortName}
      </label>
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center">
          <TypedConfigInput
            id={config.name}
            config={config}
            value={shown}
            onChange={onChange}
            disabled={locked}
            variant="legacy"
            inputClassName={clsx(classicInput, 'max-w-md disabled:bg-zinc-100 disabled:text-zinc-500')}
          />
        </div>
        {fileSet ? (
          <p className="text-xs font-bold text-[#ffa801]" data-testid="option-file-set">
            {secret
              ? t('Set by the system owner in {{file}}. The value is not shown.', { file: config.source_file ?? '' })
              : t('Set by the system owner in {{file}}.', { file: config.source_file ?? '' })}
          </p>
        ) : valueHidden && (
          <p className="text-xs text-zinc-600">{t('This value is private and is shown only to users who can edit System settings.')}</p>
        )}
        {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
        <span className="block text-xs text-zinc-600">
          <span>{config.prompt}</span>
          {' ('}
          <button type="button" onClick={onHelp} className="text-[#337ab7] hover:underline" aria-label={t('Help for {{name}}', { name: config.name })}>
            ?
          </button>
          )
        </span>
      </div>
    </div>
  );
}

/**
 * The This Session tab (`options.php:52-110`): the hint, Save, and the
 * Skin select. The choice applies to this browser only. CSS and Navbar
 * Type have no counterpart here: the classic skin has one stylesheet and
 * one navbar.
 */
function ClassicThisSession() {
  const { t } = useTranslation();
  const active = useSkin().id;
  const setSkin = useUiStore((s) => s.setSkin);
  const [skin, setSkinDraft] = useState<SkinId>(active);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSkin(skin);
      }}
      aria-label={t('This Session')}
      className="bg-white border border-zinc-300 rounded-sm p-3 space-y-3"
    >
      <p className="text-sm text-zinc-500">
        {t('These settings apply to this browser only. They are kept in the browser rather than saved on the server, so they do not affect other browsers or other users.')}
      </p>
      <div className="flex justify-end">
        <ClassicButton tone="primary" type="submit">{t('Save')}</ClassicButton>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-x-4 gap-y-1 items-start">
        <label htmlFor="skin" className="md:text-end text-sm font-semibold text-zinc-800 md:pt-1">{t('Skin')}</label>
        <div className="space-y-0.5">
          <select
            id="skin"
            value={skin}
            onChange={(e) => setSkinDraft(e.target.value as SkinId)}
            className={clsx(classicInput, 'max-w-md')}
          >
            {(Object.keys(skins) as SkinId[]).map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
          <span className="block text-xs text-zinc-600">{t('Change the skin for this session')}</span>
        </div>
      </div>
    </form>
  );
}
