import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  Camera, ChevronLeft, ChevronRight, Pause, Play, Settings as SettingsIcon, Video,
} from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { MonitorFilterBar } from '@/features/monitors/MonitorFilterBar';
import { CYCLE_INTERVAL_OPTIONS, useCyclePage, type CycleViewMode } from '@/features/cycle/useCyclePage';
import type { Monitor } from '@/types';
import { useDocumentTitle } from './useDocumentTitle';

/**
 * Cycle — Mission Control layout. Live stream on stage, transport controls
 * and quick-jump chips below. The stage is pluggable so the caller decides
 * what plays (live stream or a refreshing snapshot in Stills mode).
 */
export function CycleLayout({
  renderStage,
}: {
  renderStage: (m: Monitor, mode: CycleViewMode) => ReactNode;
}) {
  const { t } = useTranslation();
  const cycle = useCyclePage();
  const { monitors, current, index, isPaused, intervalS, countdown, viewMode } = cycle;
  useDocumentTitle(t('Cycle'));

  if (!cycle.isAuthenticated) return null;

  return (
    <AppShell title={t('Cycle')}>
      <main className="flex-1 p-4 sm:p-6 overflow-auto flex flex-col gap-4 sm:gap-6 min-h-0">
        <div className="flex-shrink-0 flex flex-wrap items-center gap-3">
          <MonitorFilterBar monitors={cycle.allMonitors} onChange={cycle.setFilteredMonitors} className="flex-1" />
          <div role="group" aria-label={t('View mode')} className="flex items-center gap-1 bg-surface rounded-lg p-1 border border-border-subtle">
            <ModeBtn active={viewMode === 'stream'} onClick={() => cycle.setViewMode('stream')} icon={<Video size={12} aria-hidden />}>{t('Stream')}</ModeBtn>
            <ModeBtn active={viewMode === 'stills'} onClick={() => cycle.setViewMode('stills')} icon={<Camera size={12} aria-hidden />}>{t('Stills')}</ModeBtn>
          </div>
        </div>

        <QueryState
          isLoading={cycle.isLoading}
          isError={cycle.isError}
          error={cycle.error}
          onRetry={cycle.refetch}
          empty={monitors.length === 0 || !current}
          emptyMessage={t('No capturing monitors to cycle through.')}
          className="flex-1"
        >
          {current && (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Video size={18} className="text-cyan shrink-0" aria-hidden />
                  <h2 className="text-lg font-semibold text-text-primary truncate">{current.name}</h2>
                  <span className="text-xs font-mono text-text-muted tabular-nums">
                    {index + 1} / {monitors.length}
                  </span>
                </div>
                <Link
                  to="/monitors/$monitorId"
                  params={{ monitorId: String(current.id) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface/50 border border-border-subtle text-text-muted hover:text-text-primary hover:border-cyan/40 transition-colors text-xs"
                >
                  <SettingsIcon size={12} aria-hidden />
                  {t('Monitor settings')}
                </Link>
              </div>

              {/* key={current.id} forces a clean mount when the active monitor
                  changes so the shared stream manager acquires/releases. */}
              <RequirePerm feature="stream" level="View" fallback="message">
                <div className="flex-1 min-h-0 flex items-center justify-center" dir="ltr">
                  <div
                    className="relative max-w-full max-h-full"
                    style={{
                      aspectRatio: `${current.width || 16} / ${current.height || 9}`,
                      width: '100%',
                      maxHeight: 'calc(100vh - 18rem)',
                    }}
                  >
                    {renderStage(current, viewMode)}
                  </div>
                </div>
              </RequirePerm>

              <div className="flex-shrink-0 flex flex-col items-center gap-3">
                <div className="flex items-center gap-2" role="group" aria-label={t('Cycle controls')}>
                  <CycleBtn onClick={cycle.prev} aria-label={t('Previous monitor')}>
                    <ChevronLeft size={18} className="rtl:-scale-x-100" aria-hidden />
                  </CycleBtn>
                  <CycleBtn
                    onClick={cycle.togglePause}
                    aria-label={isPaused ? t('Resume cycling') : t('Pause cycling')}
                    aria-pressed={isPaused}
                    highlight
                  >
                    {isPaused ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />}
                  </CycleBtn>
                  <CycleBtn onClick={cycle.next} aria-label={t('Next monitor')}>
                    <ChevronRight size={18} className="rtl:-scale-x-100" aria-hidden />
                  </CycleBtn>
                </div>

                <div className="flex items-center gap-3">
                  <span id="cycle-interval-label" className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
                    {t('Interval')}
                  </span>
                  <div role="group" aria-labelledby="cycle-interval-label" className="flex items-center gap-1 p-1 rounded-md bg-surface/50 border border-border-subtle">
                    {CYCLE_INTERVAL_OPTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => cycle.setInterval(s)}
                        aria-pressed={intervalS === s}
                        aria-label={t('{{count}} second', { count: s })}
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

                <nav aria-label={t('Monitors')} className="flex flex-wrap items-center justify-center gap-1.5 max-w-3xl">
                  {monitors.map((m, i) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => cycle.jumpTo(i)}
                      aria-current={i === index ? 'true' : undefined}
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
                </nav>
              </div>
            </>
          )}
        </QueryState>
      </main>
    </AppShell>
  );
}

function ModeBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors',
        active ? 'bg-cyan/20 text-cyan' : 'text-text-muted hover:text-text-primary',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function CycleBtn({
  children, onClick, highlight, ...rest
}: { children: ReactNode; onClick: () => void; highlight?: boolean; 'aria-label': string; 'aria-pressed'?: boolean }) {
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
