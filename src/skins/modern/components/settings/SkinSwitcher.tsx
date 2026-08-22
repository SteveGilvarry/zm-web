import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { LanguagePicker } from '@/components/common/LanguagePicker';
import { skins, useSkin } from '@/skins/registry';
import type { SkinId } from '@/skins/types';
import { useUiStore, type ThemePreference } from '@/stores/ui';

/**
 * Settings → Appearance. The one place the UI reads the active skin as a
 * value rather than through the page registry: it is the chooser itself.
 *
 * A plain section, not a panel: on the settings page the hierarchy comes
 * from spacing and type, and a border here would only box in three
 * controls (docs/DESIGN.md).
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
      aria-pressed={active === value}
      className={clsx(
        'flex-1 text-start p-3 rounded border transition-colors',
        active === value
          ? 'border-accent bg-accent/5 text-fg'
          : 'border-border-subtle text-fg-muted hover:border-border hover:text-fg',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{label}</span>
        {active === value && <span className="ms-auto text-xs text-accent">{t('Active')}</span>}
      </div>
      <p className="mt-1 text-xs text-fg-dim">{blurb}</p>
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
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-sm transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        theme === value
          ? 'bg-accent/15 text-accent'
          : 'text-fg-dim hover:text-fg hover:bg-surface-2',
      )}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </button>
  );

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium text-fg">{t('Appearance')}</h2>

      <div className="flex flex-col sm:flex-row gap-3">
        {Object.values(skins).map((def) =>
          option(def.id, skinName(def.id, def.name), skinBlurb(def.id, def.description)),
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-fg-muted">{t('Theme')}</span>
          <div
            className="flex flex-wrap items-center gap-1 rounded border border-border-subtle p-0.5"
            role="group"
            aria-label={t('Theme')}
          >
            {themeOption('system', t('System'), <Monitor size={14} />)}
            {themeOption('light', t('Light'), <Sun size={14} />)}
            {themeOption('dark', t('Dark'), <Moon size={14} />)}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-fg-muted">{t('Language')}</span>
          <LanguagePicker />
        </div>
      </div>

      {!supportsDark && (
        <p className="text-xs text-fg-dim">{t('This skin is light only.')}</p>
      )}
    </section>
  );
}
