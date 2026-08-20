import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/common/Modal';
import type { BulkModeUpdate } from './useClassicConsolePage';

interface BulkModeDialogProps {
  open: boolean;
  count: number;
  busy?: boolean;
  onClose: () => void;
  onApply: (update: BulkModeUpdate) => void;
}

const CAPTURING = ['None', 'Ondemand', 'Always'];
const ANALYSING = ['None', 'Always'];
const RECORDING = ['None', 'OnMotion', 'Always'];

/**
 * Legacy console "SELECT" dialog: set Capturing / Analysing / Recording on
 * every checked monitor at once. A blank select leaves that column alone.
 */
export function BulkModeDialog({ open, count, busy = false, onClose, onApply }: BulkModeDialogProps) {
  const { t } = useTranslation();
  const [update, setUpdate] = useState<BulkModeUpdate>({});

  const modeLabel = (v: string): string => {
    switch (v) {
      case 'None': return t('None');
      case 'Ondemand': return t('On Demand');
      case 'Always': return t('Always');
      case 'OnMotion': return t('On Motion');
      default: return v;
    }
  };

  const field = (
    key: keyof BulkModeUpdate,
    label: string,
    options: string[],
  ) => (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-text-secondary">{label}</span>
      <select
        value={update[key] ?? ''}
        onChange={(e) => setUpdate((u) => ({ ...u, [key]: e.target.value || undefined }))}
        className="px-2 py-1 rounded border border-border bg-surface text-text-primary text-sm"
      >
        <option value="">{t('Leave unchanged')}</option>
        {options.map((o) => (
          <option key={o} value={o}>{modeLabel(o)}</option>
        ))}
      </select>
    </label>
  );

  const dirty = Object.values(update).some(Boolean);

  return (
    <Modal isOpen={open} onClose={onClose} title={t('Update {{count}} monitor', { count })}>
      <div className="space-y-3">
        {field('capturing', t('Capturing'), CAPTURING)}
        {field('analysing', t('Analysing'), ANALYSING)}
        {field('recording', t('Recording'), RECORDING)}
        <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded border border-border text-text-secondary hover:text-text-primary"
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            disabled={!dirty || busy}
            onClick={() => onApply(update)}
            className="px-3 py-1.5 text-sm rounded bg-cyan text-void font-medium disabled:opacity-50"
          >
            {busy ? t('Saving…') : t('Apply')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
