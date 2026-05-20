import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { Pause, Play, Radio, Calendar, FastForward } from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { StreamCell } from '@/components/common/StreamCell';
import { MontageReviewCell } from '@/features/montagereview/MontageReviewCell';
import { MontageReviewTimeline } from '@/features/montagereview/MontageReviewTimeline';
import { useReviewClock } from '@/features/montagereview/useReviewClock';
import { getMonitors } from '@/api/monitors';
import { useAuthStore } from '@/stores/auth';
import type { Monitor } from '@/types';

export const Route = createFileRoute('/montagereview/')({
  component: MontageReviewPage,
});

type RangePreset = '1h' | '8h' | '24h' | 'all' | 'live';
const RANGE_PRESETS: { value: RangePreset; label: string; icon: 'cal' | 'live' }[] = [
  { value: '1h',  label: '1 hour',     icon: 'cal' },
  { value: '8h',  label: '8 hours',    icon: 'cal' },
  { value: '24h', label: '24 hours',   icon: 'cal' },
  { value: 'all', label: 'All events', icon: 'cal' },
  { value: 'live', label: 'Live',      icon: 'live' },
];

const SPEEDS = [0.5, 1, 2, 4];

function presetToRange(preset: RangePreset, now: Date): { start: Date; end: Date } {
  const ms = (h: number) => h * 60 * 60 * 1000;
  switch (preset) {
    case '1h':  return { start: new Date(now.getTime() - ms(1)),    end: now };
    case '8h':  return { start: new Date(now.getTime() - ms(8)),    end: now };
    case '24h': return { start: new Date(now.getTime() - ms(24)),   end: now };
    case 'all': return { start: new Date(now.getTime() - ms(24 * 30)), end: now }; // last 30 days as "all"
    case 'live': return { start: now, end: new Date(now.getTime() + ms(1)) };
  }
}

function MontageReviewPage() {
  const { isAuthenticated } = useAuthStore();
  const [preset, setPreset] = useState<RangePreset>('24h');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const isLive = preset === 'live';

  // Initial range
  const initialRange = useMemo(() => presetToRange('24h', new Date()), []);
  const clock = useReviewClock(initialRange.start, initialRange.end);

  // When the preset changes, recompute the range against "now" and reset the
  // playhead to the start of the new range.
  useEffect(() => {
    const range = presetToRange(preset, new Date());
    clock.setRange(range.start, range.end);
    clock.setCurrentTime(range.start);
    if (preset === 'live') clock.pause();
    // intentionally only react to preset
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  // Fetch monitors (only enabled / capturing ones make sense for review).
  const { data: monitorsData } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 100 }),
    enabled: isAuthenticated,
  });
  const allMonitors: Monitor[] = monitorsData?.items ?? [];
  const enabled = allMonitors.filter((m) => m.capturing !== 'None');

  // Default selection: all enabled monitors (once they load).
  useEffect(() => {
    if (selectedIds.size === 0 && enabled.length > 0) {
      setSelectedIds(new Set(enabled.map((m) => m.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled.length]);

  const selectedMonitors = enabled.filter((m) => selectedIds.has(m.id));

  const toggleMonitor = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!isAuthenticated) return null;

  return (
    <AppShell title="Montage Review">
      <main className="flex-1 p-6 overflow-auto flex flex-col gap-6 min-h-0">
        {/* Toolbar */}
        <div className="space-y-3 flex-shrink-0">
          {/* Range presets */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted mr-1">
              Range
            </span>
            {RANGE_PRESETS.map((r) => (
              <button
                key={r.value}
                onClick={() => setPreset(r.value)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md border-2 text-xs font-medium uppercase tracking-wider transition-all',
                  preset === r.value
                    ? r.value === 'live'
                      ? 'border-crimson/60 bg-crimson/15 text-crimson'
                      : 'border-cyan/60 bg-cyan/15 text-cyan'
                    : 'border-border bg-surface/50 text-text-muted hover:border-cyan/40 hover:text-cyan',
                )}
              >
                {r.icon === 'live' ? <Radio size={12} /> : <Calendar size={12} />}
                {r.label}
              </button>
            ))}
          </div>

          {/* Monitor selector + transport */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted mr-1">
              Monitors
            </span>
            {enabled.map((m) => {
              const active = selectedIds.has(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleMonitor(m.id)}
                  className={clsx(
                    'px-2.5 py-1.5 rounded-md border-2 text-xs transition-all',
                    active
                      ? 'border-cyan/50 bg-cyan/10 text-cyan'
                      : 'border-border bg-surface/30 text-text-muted hover:border-text-secondary/50 hover:text-text-secondary',
                  )}
                >
                  {m.name}
                </button>
              );
            })}

            {!isLive && (
              <>
                <div className="w-px h-6 bg-border mx-2" />
                <button
                  onClick={clock.togglePlay}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md border-2 text-xs font-medium uppercase tracking-wider transition-all',
                    clock.isPlaying
                      ? 'border-cyan/60 bg-cyan/15 text-cyan'
                      : 'border-border bg-surface/50 text-text-muted hover:border-cyan/40 hover:text-cyan',
                  )}
                >
                  {clock.isPlaying ? <Pause size={12} /> : <Play size={12} />}
                  {clock.isPlaying ? 'Pause' : 'Play'}
                </button>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface/30 border-2 border-border">
                  <FastForward size={12} className="text-text-muted" />
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      onClick={() => clock.setSpeed(s)}
                      className={clsx(
                        'px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors',
                        clock.speed === s
                          ? 'bg-cyan/20 text-cyan'
                          : 'text-text-muted hover:text-text-primary',
                      )}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Grid */}
        {selectedMonitors.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
            Select one or more monitors to review.
          </div>
        ) : (
          <div
            className="grid gap-3 flex-shrink-0"
            style={{
              gridTemplateColumns: `repeat(${gridColumns(selectedMonitors.length)}, minmax(0, 1fr))`,
            }}
          >
            {selectedMonitors.map((m) =>
              isLive ? (
                <div key={m.id} className="relative aspect-video">
                  <StreamCell
                    protocol="hls"
                    monitorId={m.id}
                    monitorName={m.name}
                    orientation={m.orientation}
                    autoStart
                    compact
                  />
                </div>
              ) : (
                <MontageReviewCell
                  key={m.id}
                  monitor={m}
                  currentTime={clock.currentTime}
                  rangeStart={clock.rangeStart}
                  rangeEnd={clock.rangeEnd}
                  isPlaying={clock.isPlaying}
                  speed={clock.speed}
                />
              ),
            )}
          </div>
        )}

        {/* Timeline */}
        {!isLive && selectedMonitors.length > 0 && (
          <div className="flex-shrink-0">
            <MontageReviewTimeline
              monitors={selectedMonitors}
              rangeStart={clock.rangeStart}
              rangeEnd={clock.rangeEnd}
              currentTime={clock.currentTime}
              onSeek={clock.setCurrentTime}
            />
          </div>
        )}
      </main>
    </AppShell>
  );
}

function gridColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}
