import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Monitor, Moon, Server, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { Panel } from '@/components/common/Panel';
import { LanguagePicker } from '@/components/common/LanguagePicker';
import { skins, useSkin } from '@/skins/registry';
import type { SkinId } from '@/skins/types';
import { useUiStore, type ThemePreference } from '@/stores/ui';

/**
 * Settings → Appearance. The one place the UI reads the active skin as a
 * value rather than through the page registry: it is the chooser itself.
 */
export function SkinSwitcher() {
  const { t } = useTranslation();
  const activeSkin = useSkin();
  const active = activeSkin.id;
  const setSkin = useUiStore((s) => s.setSkin);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  // The registry holds the English name/blurb; translate by id so `t()`
  // sees literal keys, falling back to the registry text for unknown skins.
  const skinName = (id: SkinId, fallback: string) => {
    switch (id) {
      case 'modern': return t('Mission Control');
      case 'classic': return t('Classic ZoneMinder');
      default: return fallback;
    }
  };
  const skinBlurb = (id: SkinId, fallback: string) => {
    switch (id) {
      case 'modern': return t('The modern dashboard — adaptive layouts, live thumbnails, dense data panels.');
      case 'classic': return t('Faithful to the legacy ZoneMinder layout — top nav and dense tables, for operators migrating from the old interface.');
      default: return fallback;
    }
  };

  const option = (value: SkinId, label: string, blurb: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setSkin(value)}
      className={clsx(
        'flex-1 text-start p-4 rounded-lg border transition-colors',
        active === value
          ? 'bg-accent/10 border-accent/40 text-fg'
          : 'bg-surface/50 border-border-subtle text-fg-dim hover:border-fg-dim/50 hover:text-fg',
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={clsx(
            'w-2 h-2 rounded-full',
            active === value ? 'bg-accent' : 'bg-border',
          )}
        />
        <span className="font-medium">{label}</span>
        {active === value && (
          <span className="ms-auto text-label font-mono text-accent">{t('ACTIVE')}</span>
        )}
      </div>
      <div className="text-label text-fg-dim">{blurb}</div>
    </button>
  );

  // Only offered for skins whose tokens define both schemes; the classic skin
  // reproduces a light-only UI and stays light whatever the OS says.
  // `?? true` because a skin definition is allowed to omit the field.
  const supportsDark = activeSkin.colorSchemes?.includes('dark') ?? true;
  const themeOption = (value: ThemePreference, label: string, icon: ReactNode) => (
    <button
      key={value}
      type="button"
      onClick={() => setTheme(value)}
      aria-pressed={theme === value}
      disabled={!supportsDark}
      className={clsx(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        theme === value
          ? 'bg-accent/10 border-accent/40 text-accent'
          : 'bg-surface/50 border-border-subtle text-fg-muted hover:text-fg hover:border-border',
      )}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </button>
  );

  return (
    <Panel title={t('Appearance')} icon={<Server size={18} />}>
      <div className="flex flex-col sm:flex-row gap-3">
        {Object.values(skins).map((def) =>
          option(def.id, skinName(def.id, def.name), skinBlurb(def.id, def.description)),
        )}
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-fg-muted">{t('Theme')}</span>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('Theme')}>
            {themeOption('system', t('System'), <Monitor size={14} />)}
            {themeOption('light', t('Light'), <Sun size={14} />)}
            {themeOption('dark', t('Dark'), <Moon size={14} />)}
          </div>
        </div>
        {!supportsDark && (
          <p className="mt-2 text-label text-fg-dim">
            {t('This skin is light only.')}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="text-sm text-fg-muted">{t('Language')}</span>
        <LanguagePicker />
      </div>
    </Panel>
  );
}
