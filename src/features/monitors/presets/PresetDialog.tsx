import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { buttonClasses, fieldClasses } from '@/components/common/styles';
import type { MonitorCreateInput } from '@/api/monitors-crud';
import { usePresets } from './usePresets';
import { applyPreset } from './applyPreset';

interface PresetDialogProps {
  /** Called with the preset's values; the caller writes them into its draft. Nothing is saved. */
  onApply: (values: Partial<MonitorCreateInput>) => void;
  onClose: () => void;
}

/**
 * Legacy `?view=monitorpreset&mid=` (`monitorpreset.php`): pick a preset and
 * Save copies its source settings into the monitor being edited, over what
 * is already there. Save stays disabled until a preset is chosen.
 */
export function PresetDialog({ onApply, onClose }: PresetDialogProps) {
  const { t } = useTranslation();
  const { presets, isLoading, isError } = usePresets();
  const [picked, setPicked] = useState('');
  const preset = presets.find((p) => String(p.id) === picked);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('Monitor Preset')}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded border border-border bg-surface shadow-elevated">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <h2 className="text-sm font-semibold text-fg">{t('Monitor Preset')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Close')}
            className="p-1.5 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors"
          >
            <X size={14} />
          </button>
        </header>
        <div className="p-4 space-y-3 text-sm text-fg-muted">
          <p>{t('Select an appropriate preset from the list below.')}</p>
          <p>{t('Please note that this may overwrite any values you already have configured for the current monitor.')}</p>
          <label className="flex items-center gap-3">
            <span className="text-label text-fg-dim w-16 flex-shrink-0">{t('Preset')}</span>
            <select
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              disabled={isLoading}
              className={fieldClasses('sm', false)}
            >
              <option value="">{isLoading ? t('Loading presets…') : t('Choose Preset')}</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          {isError && <p className="text-xs text-danger">{t('Could not load monitor presets.')}</p>}
        </div>
        <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-subtle">
          <button
            type="button"
            disabled={!preset}
            onClick={() => { if (preset) { onApply(applyPreset(preset)); onClose(); } }}
            className={buttonClasses('primary', 'sm')}
          >
            {t('Save')}
          </button>
          <button type="button" onClick={onClose} className={buttonClasses('secondary', 'sm')}>
            {t('Cancel')}
          </button>
        </footer>
      </div>
    </div>
  );
}
