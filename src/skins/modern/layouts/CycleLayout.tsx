import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft, ChevronRight, Pause, Play, Settings as SettingsIcon, Video,
} from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { CYCLE_INTERVAL_OPTIONS, useCyclePage } from '@/features/cycle/useCyclePage';
import type { Monitor } from '@/types';
import { useDocumentTitle } from './useDocumentTitle';

/**
 * Cycle — Mission Control layout. Live stream on stage, transport controls
 * and quick-jump chips below. The stage is pluggable so the classic skin can
 * reuse this layout with a refreshing snapshot until it has its own layout.
 */
export function CycleLayout({ renderStage }: { renderStage: (m: Monitor) => ReactNode }) {
  const { t } = useTranslation();
  const cycle = useCyclePage();
  const { monitors, current, index, isPaused, intervalS, countdown } = cycle;
  useDocumentTitle(t('Cycle'));

  if (!cycle.isAuthenticated) return null;

  return (
    <AppShell title={t('Cycle')}>
      <main className="flex-1 p-6 overflow-auto flex flex-col gap-6 min-h-0">
        {cycle.isError ? (
          <div role="alert" className="flex-1 flex items-center justify-center text-crimson text-sm">
            {t('Could not load monitors.')}
          </div>
        ) : monitors.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
            {t('No capturing monitors to cycle through.')}
          </div>
        ) : !current ? null : (
          <>
            <div className="flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <Video size={18} className="text-cyan" />
                <h2 className="text-lg font-semibold text-text-primary">{current.name}</h2>
                <span className="text-xs font-mono text-text-muted tabular-nums">
                  {index + 1} / {monitors.length}
                </span>
              </div>
              <Link
                to="/monitors/$monitorId"
                params={{ monitorId: String(current.id) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface/50 border border-border-subtle text-text-muted hover:text-text-primary hover:border-cyan/40 transition-colors text-xs"
              >
                <SettingsIcon size={12} />
                {t('Monitor settings')}
              </Link>
            </div>

            {/* key={current.id} forces a clean mount when the active monitor
                changes so the shared stream manager acquires/releases. */}
            <div className="flex-1 min-h-0 flex items-center justify-center" dir="ltr">
              <div
                className="relative max-w-full max-h-full"
                style={{
                  aspectRatio: `${current.width || 16} / ${current.height || 9}`,
                  width: '100%',
                  maxHeight: 'calc(100vh - 18rem)',
                }}
              >
                {renderStage(current)}
              </div>
            </div>

            <div className="flex-shrink-0 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2">
                <CycleBtn onClick={cycle.prev} aria-label={t('Previous')}>
                  <ChevronLeft size={18} className="rtl:-scale-x-100" />
                </CycleBtn>
                <CycleBtn
                  onClick={cycle.togglePause}
                  aria-label={isPaused ? t('Resume cycling') : t('Pause cycling')}
                  highlight
                >
                  {isPaused ? <Play size={18} /> : <Pause size={18} />}
                </CycleBtn>
                <CycleBtn onClick={cycle.next} aria-label={t('Next')}>
                  <ChevronRight size={18} className="rtl:-scale-x-100" />
                </CycleBtn>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
                  {t('Interval')}
                </span>
                <div className="flex items-center gap-1 p-1 rounded-md bg-surface/50 border border-border-subtle">
                  {CYCLE_INTERVAL_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => cycle.setInterval(s)}
                      className={clsx(
                        'px-2 py-0.5 text-[10px] font-mono rounded transition-colors',
                        intervalS === s ? 'bg-cyan/20 text-cyan' : 'text-text-muted hover:text-text-primary',
                      )}
                    >
                      {s}s
                    </button>
                  ))}
                </div>
                {!isPaused && monitors.length > 1 && (
                  <span className="text-xs font-mono text-cyan tabular-nums w-10 text-end">
                    {countdown}s
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-3xl">
                {monitors.map((m, i) => (
                  <button
                    key={m.id}
                    onClick={() => cycle.jumpTo(i)}
                    className={clsx(
                      'px-2.5 py-1 rounded text-[11px] transition-all',
                      i === index
                        ? 'bg-cyan/20 text-cyan border border-cyan/40'
                        : 'bg-surface/30 text-text-muted border border-border-subtle hover:border-text-secondary/50 hover:text-text-secondary',
                    )}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}

function CycleBtn({
  children, onClick, highlight, ...rest
}: { children: ReactNode; onClick: () => void; highlight?: boolean; 'aria-label': string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'p-2.5 rounded-lg border transition-colors',
        highlight
          ? 'bg-cyan/20 text-cyan border-cyan/40 hover:bg-cyan/30'
          : 'bg-surface/50 text-text-muted border-border-subtle hover:text-text-primary hover:border-text-secondary/50',
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
