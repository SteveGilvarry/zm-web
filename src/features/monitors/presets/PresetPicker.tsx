import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import type { MonitorPreset } from '@/api/monitorPresets';
import { usePresets } from './usePresets';

interface PresetPickerProps {
  onPick: (preset: MonitorPreset) => void;
  className?: string;
}

/**
 * The legacy "Presets" dropdown on the new-monitor form: picking one copies
 * its source settings into the form. Rendered as a plain select so it works
 * the same in both skins.
 */
export function PresetPicker({ onPick, className }: PresetPickerProps) {
  const { t } = useTranslation();
  const { presets, isLoading, isError } = usePresets();
  return (
    <div className="flex-1">
      <select
        value=""
        aria-label={t('Preset')}
        disabled={isLoading || presets.length === 0}
        onChange={(e) => {
          const preset = presets.find((p) => p.id === Number(e.target.value));
          if (preset) onPick(preset);
        }}
        className={clsx('w-full', className)}
      >
        <option value="">
          {isLoading ? t('Loading presets…') : presets.length === 0 ? t('No presets available') : t('Apply a preset…')}
        </option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      {isError && <p className="text-xs text-danger mt-1">{t('Could not load monitor presets.')}</p>}
    </div>
  );
}
