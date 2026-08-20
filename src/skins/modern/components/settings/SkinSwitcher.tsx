import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Server } from 'lucide-react';
import { Panel } from '@/components/common/Panel';
import { LanguagePicker } from '@/components/common/LanguagePicker';
import { skins, useSkin } from '@/skins/registry';
import type { SkinId } from '@/skins/types';
import { useUiStore } from '@/stores/ui';

/**
 * Settings → Appearance. The one place the UI reads the active skin as a
 * value rather than through the page registry: it is the chooser itself.
 */
export function SkinSwitcher() {
  const { t } = useTranslation();
  const active = useSkin().id;
  const setSkin = useUiStore((s) => s.setSkin);

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
          ? 'bg-cyan/10 border-cyan/40 text-text-primary'
          : 'bg-surface/50 border-border-subtle text-text-muted hover:border-text-muted/50 hover:text-text-primary',
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={clsx(
            'w-2 h-2 rounded-full',
            active === value ? 'bg-cyan' : 'bg-border',
          )}
        />
        <span className="font-medium">{label}</span>
        {active === value && (
          <span className="ms-auto text-[10px] font-mono text-cyan">{t('ACTIVE')}</span>
        )}
      </div>
      <div className="text-xs text-text-muted">{blurb}</div>
    </button>
  );

  return (
    <Panel title={t('Appearance')} icon={<Server size={18} />}>
      <div className="flex flex-col sm:flex-row gap-3">
        {Object.values(skins).map((def) =>
          option(def.id, skinName(def.id, def.name), skinBlurb(def.id, def.description)),
        )}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className="text-sm text-text-secondary">{t('Language')}</span>
        <LanguagePicker />
      </div>
    </Panel>
  );
}
