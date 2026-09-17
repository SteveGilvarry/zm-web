import { useEffect, useRef, useState } from 'react';
import { Check, Columns3 } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { FRAMES_COLUMNS, type FramesColumnKey } from './framesTable';
import { useFramesColumnLabels } from './columnLabels';

interface FramesColumnChooserProps {
  isVisible: (key: FramesColumnKey) => boolean;
  onToggle: (key: FramesColumnKey) => void;
  onReset: () => void;
  /** `classic` renders the outlined zinc button the legacy skin uses. */
  variant?: 'modern' | 'classic';
}

/**
 * The frames table's "Columns" dropdown — bootstrap-table's column picker on
 * legacy's frames page. The choice lives with the page, as it does there.
 */
export function FramesColumnChooser({
  isVisible, onToggle, onReset, variant = 'modern',
}: FramesColumnChooserProps) {
  const { t } = useTranslation();
  const labels = useFramesColumnLabels();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [open]);

  const buttonCls = variant === 'classic'
    ? 'px-3 py-1.5 rounded-sm border border-[#adb5bd] bg-[#e9ecef] text-sm text-zinc-800 hover:bg-[#dde1e5] inline-flex items-center gap-1.5'
    : 'px-2 py-1 rounded border border-border-subtle bg-surface text-xs text-fg-muted hover:text-fg hover:border-border inline-flex items-center gap-1.5 transition-colors';
  const panelCls = variant === 'classic'
    ? 'absolute end-0 top-full mt-1 z-20 w-56 bg-white border border-zinc-300 rounded-sm shadow-lg py-1 text-sm text-zinc-800'
    : 'absolute end-0 top-full mt-1 z-20 w-56 bg-surface border border-border rounded shadow-[var(--elevation-2)] py-1 text-sm text-fg';
  const itemCls = variant === 'classic'
    ? 'w-full flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-zinc-50 text-start'
    : 'w-full flex items-center justify-between gap-2 px-3 py-1 hover:bg-surface-2 text-start';

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={buttonCls}
      >
        <Columns3 size={14} aria-hidden />
        {t('Columns')}
      </button>
      {open && (
        <div className={panelCls} data-testid="frames-column-chooser">
          {FRAMES_COLUMNS.map((col) => (
            <button
              key={col.key}
              type="button"
              onClick={() => onToggle(col.key)}
              className={itemCls}
            >
              {labels[col.key]}
              {isVisible(col.key) && <Check size={14} aria-hidden />}
            </button>
          ))}
          <button type="button" onClick={onReset} className={clsx(itemCls, 'border-t border-border-subtle mt-1 pt-1.5')}>
            {t('Reset columns')}
          </button>
        </div>
      )}
    </div>
  );
}
