import { useEffect, useRef, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Filter, Radio, Wifi, VideoOff } from 'lucide-react';
import type { StreamProtocol } from '@/types';

/**
 * The console's entire chrome, in one line.
 *
 * It replaces a four-card overview strip, a bordered "System" panel and a
 * permanently-open eight-control filter row — roughly a third of the screen
 * spent on things an operator glances at, on a page whose job is to show
 * cameras (docs/DESIGN.md). Anything diagnostic (daemon list, full stats) or
 * occasional (filters) is one click away in a disclosure rather than always
 * on screen.
 */

export interface StatusReading {
  label: string;
  value: string;
  tone?: 'normal' | 'warn' | 'danger';
  /** A state mark rendered before the value — a recording dot, say. */
  mark?: ReactNode;
}

interface ConsoleStatusLineProps {
  running: boolean | null;
  readings: StatusReading[];
  /** Number of filters currently narrowing the wall; 0 hides the badge. */
  activeFilters: number;
  filterPanel: ReactNode;
  systemPanel: ReactNode;
  protocol: StreamProtocol | null;
  onProtocol: (p: StreamProtocol | null) => void;
}

const toneClass = {
  normal: 'text-fg',
  warn: 'text-warn',
  danger: 'text-danger',
} as const;

export function ConsoleStatusLine({
  running,
  readings,
  activeFilters,
  filterPanel,
  systemPanel,
  protocol,
  onProtocol,
}: ConsoleStatusLineProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<'filters' | 'system' | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // A disclosure that stays open when you click elsewhere is a trap on a
  // page that is mostly video.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      role="region"
      aria-label={t('Console status')}
      className="relative z-20 border-b border-border-subtle bg-surface"
    >
      <div className="flex items-center gap-5 px-4 h-11 overflow-x-auto">
        <button
          type="button"
          onClick={() => setOpen(open === 'system' ? null : 'system')}
          aria-expanded={open === 'system'}
          aria-label={t('System detail')}
          className="flex items-center gap-2 text-sm shrink-0 rounded hover:text-fg transition-colors"
        >
          <span
            aria-hidden
            className={clsx(
              'w-2 h-2 rounded-full',
              running === null ? 'bg-fg-faint' : running ? 'bg-ok' : 'bg-danger',
            )}
          />
          <span className={running === false ? 'text-danger' : 'text-fg'}>
            {running === null ? '…' : running ? t('Running') : t('Stopped')}
          </span>
          <ChevronDown size={12} className="text-fg-faint" aria-hidden />
        </button>

        <div className="w-px h-5 bg-border-subtle shrink-0" aria-hidden />

        {readings.map((r) => (
          <span key={r.label} className="flex items-baseline gap-1.5 text-sm shrink-0">
            <span className="text-fg-dim">{r.label}</span>
            {r.mark}
            <span className={clsx('font-mono tabular-nums', toneClass[r.tone ?? 'normal'])}>
              {r.value}
            </span>
          </span>
        ))}

        <div className="ms-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setOpen(open === 'filters' ? null : 'filters')}
            aria-expanded={open === 'filters'}
            className={clsx(
              'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
              activeFilters > 0 || open === 'filters'
                ? 'bg-accent/15 text-accent'
                : 'text-fg-dim hover:text-fg',
            )}
          >
            <Filter size={12} aria-hidden />
            {t('Filters')}
            {activeFilters > 0 && (
              <span className="font-mono tabular-nums">{activeFilters}</span>
            )}
          </button>

          <div
            role="group"
            aria-label={t('Thumbnail mode')}
            className="flex items-center gap-0.5 rounded border border-border-subtle p-0.5"
          >
            {([
              ['webrtc', Wifi, t('WebRTC live thumbnails'), 'RTC'],
              ['hls', Radio, t('HLS live thumbnails'), 'HLS'],
              [null, VideoOff, t('Static thumbnails (no streaming)'), t('Off')],
            ] as const).map(([mode, Icon, label, text]) => (
              <button
                key={String(mode)}
                type="button"
                aria-pressed={protocol === mode}
                aria-label={label}
                title={label}
                onClick={() => onProtocol(mode)}
                className={clsx(
                  'flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors',
                  protocol === mode ? 'bg-accent/15 text-accent' : 'text-fg-dim hover:text-fg',
                )}
              >
                <Icon size={10} aria-hidden />
                {text}
              </button>
            ))}
          </div>
        </div>
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full border-b border-border bg-surface shadow-[var(--elevation-2)] p-4 max-h-[60vh] overflow-auto">
          {open === 'filters' ? filterPanel : systemPanel}
        </div>
      )}
    </div>
  );
}
