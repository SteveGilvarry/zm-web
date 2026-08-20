import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Languages } from 'lucide-react';
import { LANGUAGES, changeLanguage } from '@/i18n';

const available = import.meta.glob('../../locales/*/translation.json');
const availableCodes = new Set(
  Object.keys(available)
    .map((p) => p.match(/locales\/([^/]+)\//)?.[1])
    .filter((c): c is string => Boolean(c)),
);

/**
 * Language selector. Lists the languages with a catalogue on disk (English
 * always). Changing it persists via the detector's localStorage cache and
 * flips document direction for RTL languages.
 */
export function LanguagePicker({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const options = LANGUAGES.filter((l) => l.code === 'en' || availableCodes.has(l.code));
  const current = options.find((l) => l.code === i18n.resolvedLanguage)?.code
    ?? options.find((l) => l.code === i18n.language?.split('-')[0])?.code
    ?? 'en';

  return (
    <label className={clsx('inline-flex items-center gap-2 text-sm', className)}>
      <Languages size={16} className="text-text-muted" aria-hidden />
      <span className="sr-only">{t('Language')}</span>
      <select
        value={current}
        onChange={(e) => void changeLanguage(e.target.value)}
        className="px-2 py-1.5 rounded-lg bg-surface border border-border-subtle text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan/50"
      >
        {options.map((l) => (
          <option key={l.code} value={l.code} lang={l.code} dir={l.dir}>
            {l.nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}
