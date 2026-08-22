import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  Camera, ChevronLeft, ChevronRight, Filter, Pause, Play, Settings as SettingsIcon, Video,
} from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { MonitorFilterBar } from '@/features/monitors/MonitorFilterBar';
import { useMonitorFilter } from '@/features/monitors/useMonitorFilter';
import { displayDimensions } from '@/features/monitors/orientation';
import { CYCLE_INTERVAL_OPTIONS, useCyclePage, type CycleViewMode } from '@/features/cycle/useCyclePage';
import type { Monitor } from '@/types';
import { ToolbarDisclosure } from '../components/ToolbarDisclosure';
import { useDocumentTitle } from './useDocumentTitle';

// The bar reports through the shared filter store, which the page already
// reads (useMonitorFilter below), so its callback has nothing left to do.
const noop = () => {};

/**
 * Cycle — the modern frame.
 *
 * One control line, then the camera. Transport, dwell interval and the
 * quick-jump strip used to stack three rows of chrome under the picture and
 * squeeze the stream into whatever was left; here the stage takes every
 * pixel the frame can spare (docs/DESIGN.md). The stage is pluggable so the
 * caller decides what plays — live stream, or a refreshing snapshot.
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

  // The filter bar lives behind a disclosure, so the page applies the shared
  // selections itself rather than waiting for the bar to be on screen.
  const { filtered, activeCount } = useMonitorFilter(cycle.allMonitors);
  const setFilteredMonitors = cycle.setFilteredMonitors;
  useEffect(() => {
    setFilteredMonitors(filtered);
  }, [filtered, setFilteredMonitors]);

  const stageRef = useRef<HTMLDivElement>(null);
  const box = useBoxSize(stageRef);

  if (!cycle.isAuthenticated) return null;

  const dims = current ? displayDimensions(current) : { width: 16, height: 9 };

  return (
    <AppShell title={t('Cycle')}>
      <main className="flex-1 min-h-0 min-w-0 flex flex-col">
        <div className="flex items-center gap-3 px-3 h-11 shrink-0 border-b border-border-subtle bg-surface">
          {current && (
            <>
              <h2 className="text-sm font-medium text-fg truncate min-w-0">{current.name}</h2>
              <span className="text-xs font-mono tabular-nums text-fg-dim shrink-0">
                {index + 1} / {monitors.length}
              </span>
            </>
          )}

          <div className="ms-auto flex items-center gap-2 shrink-0">
            {current && (
              <>
                <div className="flex items-center gap-1" role="group" aria-label={t('Cycle controls')}>
                  <CycleBtn onClick={cycle.prev} aria-label={t('Previous monitor')}>
                    <ChevronLeft size={14} className="rtl:-scale-x-100" aria-hidden />
                  </CycleBtn>
                  <CycleBtn
                    onClick={cycle.togglePause}
                    aria-label={isPaused ? t('Resume cycling') : t('Pause cycling')}
                    aria-pressed={isPaused}
                  >
                    {isPaused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
                  </CycleBtn>
                  <CycleBtn onClick={cycle.next} aria-label={t('Next monitor')}>
                    <ChevronRight size={14} className="rtl:-scale-x-100" aria-hidden />
                  </CycleBtn>
                </div>

                <div
                  role="group"
                  aria-label={t('Interval')}
                  className="flex items-center gap-0.5 rounded border border-border-subtle p-0.5"
                >
                  {CYCLE_INTERVAL_OPTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => cycle.setInterval(s)}
                      aria-pressed={intervalS === s}
                      aria-label={t('{{count}} second', { count: s })}
                      className={clsx(
                        'px-1.5 py-0.5 text-xs font-mono tabular-nums rounded transition-colors',
                        intervalS === s ? 'bg-accent/15 text-accent' : 'text-fg-dim hover:text-fg',
                      )}
                    >
                      {s}s
                    </button>
                  ))}
                </div>

                {!isPaused && monitors.length > 1 && (
                  <span className="w-8 text-end text-xs font-mono tabular-nums text-fg-dim">
                    {countdown}s
                  </span>
                )}

                <div
                  role="group"
                  aria-label={t('View mode')}
                  className="flex items-center gap-0.5 rounded border border-border-subtle p-0.5"
                >
                  <ModeBtn active={viewMode === 'stream'} onClick={() => cycle.setViewMode('stream')} icon={<Video size={12} aria-hidden />}>{t('Stream')}</ModeBtn>
                  <ModeBtn active={viewMode === 'stills'} onClick={() => cycle.setViewMode('stills')} icon={<Camera size={12} aria-hidden />}>{t('Stills')}</ModeBtn>
                </div>
              </>
            )}

            <ToolbarDisclosure label={t('Filters')} icon={Filter} count={activeCount} align="end">
              <MonitorFilterBar monitors={cycle.allMonitors} onChange={noop} />
            </ToolbarDisclosure>

            {current && (
              <Link
                to="/monitors/$monitorId"
                params={{ monitorId: String(current.id) }}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors"
              >
                <SettingsIcon size={12} aria-hidden />
                {t('Monitor settings')}
              </Link>
            )}
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
            <div className="flex-1 min-h-0 flex flex-col">
              {/* key={current.id} forces a clean mount when the active monitor
                  changes so the shared stream manager acquires/releases. */}
              <RequirePerm feature="stream" level="View" fallback="message">
                <div
                  ref={stageRef}
                  className="flex-1 min-h-0 p-2 flex items-center justify-center"
                  dir="ltr"
                >
                  <div className="relative" style={fitStyle(box, dims.width, dims.height)}>
                    {renderStage(current, viewMode)}
                  </div>
                </div>
              </RequirePerm>

              <nav
                aria-label={t('Monitors')}
                className="shrink-0 flex items-center gap-1 px-3 py-1.5 border-t border-border-subtle bg-surface overflow-x-auto"
              >
                {monitors.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => cycle.jumpTo(i)}
                    aria-current={i === index ? 'true' : undefined}
                    className={clsx(
                      'shrink-0 px-2 py-0.5 rounded text-xs transition-colors',
                      i === index
                        ? 'bg-accent/15 text-accent'
                        : 'text-fg-dim hover:text-fg hover:bg-surface-2',
                    )}
                  >
                    {m.name}
                  </button>
                ))}
              </nav>
            </div>
          )}
        </QueryState>
      </main>
    </AppShell>
  );
}

/* ------------------------------------------------------------------------ */
/*  Stage sizing                                                            */
/* ------------------------------------------------------------------------ */

/** The live size of an element, tracked through a ResizeObserver. */
function useBoxSize(ref: RefObject<HTMLElement | null>) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ width: r.width, height: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

/**
 * The largest box with the camera's displayed aspect that fits the region.
 *
 * CSS cannot express "fit both axes" for a non-replaced element with an
 * aspect ratio — `max-height` does not feed back into the derived width —
 * so the region is measured and the box sized outright.
 */
function fitStyle(
  box: { width: number; height: number },
  w: number,
  h: number,
): CSSProperties {
  if (box.width <= 0 || box.height <= 0 || w <= 0 || h <= 0) {
    return { width: '100%', aspectRatio: `${w || 16} / ${h || 9}` };
  }
  const scale = Math.min(box.width / w, box.height / h);
  return { width: Math.floor(w * scale), height: Math.floor(h * scale) };
}

function ModeBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors',
        active ? 'bg-accent/15 text-accent' : 'text-fg-dim hover:text-fg',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function CycleBtn({
  children, onClick, ...rest
}: { children: ReactNode; onClick: () => void; 'aria-label': string; 'aria-pressed'?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-1.5 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors"
      {...rest}
    >
      {children}
    </button>
  );
}
