import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  ChevronLeft, ChevronRight, Pause, Play, Settings as SettingsIcon, Video,
} from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { StreamCell } from '@/components/common/StreamCell';
import { getMonitors } from '@/api/monitors';
import { useAuthStore } from '@/stores/auth';

export const Route = createFileRoute('/cycle/')({
  component: CyclePage,
});

const DEFAULT_INTERVAL_S = 10;
const INTERVAL_OPTIONS = [5, 10, 20, 30, 60];

function CyclePage() {
  const { isAuthenticated } = useAuthStore();

  const { data: monitorsData } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 100 }),
    enabled: isAuthenticated,
  });

  const monitors = useMemo(
    () => (monitorsData?.items ?? []).filter((m) => m.capturing !== 'None'),
    [monitorsData],
  );

  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [intervalS, setIntervalS] = useState(DEFAULT_INTERVAL_S);
  const [countdown, setCountdown] = useState(DEFAULT_INTERVAL_S);

  // Always render against a clamped index — if the monitor list shrinks under
  // us we still pick a valid camera without needing an effect to "correct"
  // state. Keeps the React Compiler set-state-in-effect rule happy.
  const safeIndex = monitors.length === 0 ? 0 : index % monitors.length;

  // Auto-advance + countdown. Only the interval lives in the effect — every
  // reset of `countdown` is performed by an event handler (toggle, next/prev,
  // interval picker) so the effect body never calls setState synchronously.
  useEffect(() => {
    if (isPaused || monitors.length <= 1) return;
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          setIndex((i) => (i + 1) % Math.max(monitors.length, 1));
          return intervalS;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isPaused, intervalS, monitors.length]);

  const next = () => {
    if (monitors.length === 0) return;
    setIndex((i) => (i + 1) % monitors.length);
    setCountdown(intervalS);
  };
  const prev = () => {
    if (monitors.length === 0) return;
    setIndex((i) => (i - 1 + monitors.length) % monitors.length);
    setCountdown(intervalS);
  };
  const togglePause = () => {
    setIsPaused((p) => {
      // Resuming → reset the countdown so the next tick starts fresh.
      if (p) setCountdown(intervalS);
      return !p;
    });
  };

  const current = monitors[safeIndex];

  if (!isAuthenticated) return null;

  return (
    <AppShell title="Cycle">
      <main className="flex-1 p-6 overflow-auto flex flex-col gap-6 min-h-0">
        {monitors.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
            No capturing monitors to cycle through.
          </div>
        ) : !current ? null : (
          <>
            {/* Header — current camera + position */}
            <div className="flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <Video size={18} className="text-cyan" />
                <h2 className="text-lg font-semibold text-text-primary">
                  {current.name}
                </h2>
                <span className="text-xs font-mono text-text-muted tabular-nums">
                  {safeIndex + 1} / {monitors.length}
                </span>
              </div>
              <Link
                to="/monitors/$monitorId"
                params={{ monitorId: String(current.id) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface/50 border border-border-subtle text-text-muted hover:text-text-primary hover:border-cyan/40 transition-colors text-xs"
              >
                <SettingsIcon size={12} />
                Monitor settings
              </Link>
            </div>

            {/* Stage — single big live stream. key={current.id} forces a clean
                mount when the active monitor changes so the shared stream
                manager acquires/releases correctly. */}
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <div
                className="relative max-w-full max-h-full"
                style={{
                  aspectRatio: `${current.width || 16} / ${current.height || 9}`,
                  width: '100%',
                  maxHeight: 'calc(100vh - 18rem)',
                }}
              >
                <StreamCell
                  key={current.id}
                  protocol="webrtc"
                  monitorId={current.id}
                  monitorName={current.name}
                  orientation={current.orientation}
                  autoStart
                />
              </div>
            </div>

            {/* Transport */}
            <div className="flex-shrink-0 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2">
                <CycleBtn onClick={prev} aria-label="Previous">
                  <ChevronLeft size={18} />
                </CycleBtn>
                <CycleBtn
                  onClick={togglePause}
                  aria-label={isPaused ? 'Resume cycling' : 'Pause cycling'}
                  highlight
                >
                  {isPaused ? <Play size={18} /> : <Pause size={18} />}
                </CycleBtn>
                <CycleBtn onClick={next} aria-label="Next">
                  <ChevronRight size={18} />
                </CycleBtn>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
                  Interval
                </span>
                <div className="flex items-center gap-1 p-1 rounded-md bg-surface/50 border border-border-subtle">
                  {INTERVAL_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setIntervalS(s);
                        setCountdown(s);
                      }}
                      className={clsx(
                        'px-2 py-0.5 text-[10px] font-mono rounded transition-colors',
                        intervalS === s
                          ? 'bg-cyan/20 text-cyan'
                          : 'text-text-muted hover:text-text-primary',
                      )}
                    >
                      {s}s
                    </button>
                  ))}
                </div>
                {!isPaused && monitors.length > 1 && (
                  <span className="text-xs font-mono text-cyan tabular-nums w-10 text-right">
                    {countdown}s
                  </span>
                )}
              </div>

              {/* Quick-jump chips so an operator can pin a specific cam without
                  cycling through. */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-3xl">
                {monitors.map((m, i) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setIndex(i);
                      setCountdown(intervalS);
                    }}
                    className={clsx(
                      'px-2.5 py-1 rounded text-[11px] transition-all',
                      i === safeIndex
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
  highlight,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { highlight?: boolean }) {
  return (
    <button
      type="button"
      className={clsx(
        'w-11 h-11 flex items-center justify-center rounded-md border-2 transition-all select-none',
        highlight
          ? 'border-cyan/50 bg-cyan/15 text-cyan hover:bg-cyan/25 hover:border-cyan/70 hover:shadow-[0_0_10px_rgba(0,212,255,0.25)] active:scale-95'
          : 'border-border bg-surface text-text-secondary hover:border-cyan/40 hover:text-cyan active:scale-95',
        className,
      )}
      {...rest}
    />
  );
}
