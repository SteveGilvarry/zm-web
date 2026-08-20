import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Pause, Play, Radio, Calendar, FastForward } from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { StreamCell } from '@/components/common/StreamCell';
import { MontageReviewCell } from '@/features/montagereview/MontageReviewCell';
import { MontageReviewTimeline } from '@/features/montagereview/MontageReviewTimeline';
import { MonitorFilterBar } from '@/features/monitors/MonitorFilterBar';
import {
  useReviewRangePresets,
  REVIEW_SPEEDS,
  reviewGridColumns,
  useMontageReviewPage,
  type ReviewRangePreset,
} from '@/features/montagereview/useMontageReviewPage';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/** Montage Review — Mission Control: range presets, monitor chips, grid, timeline. */
export default function MontageReviewPage() {
  const { t } = useTranslation();
  const page = useMontageReviewPage();
  const rangePresets = useReviewRangePresets();
  useDocumentTitle(t('Montage Review'));
  const {
    preset, setPreset, isLive, clock, allMonitors, setFilteredMonitors,
    enabled, selectedIds, selectedMonitors, toggleMonitor,
  } = page;

  // Range preset labels live in the feature module as plain English; map the
  // ids to literal keys here so extraction sees them.
  const presetLabel = (value: ReviewRangePreset): string => {
    switch (value) {
      case '1h': return t('1 hour');
      case '8h': return t('8 hours');
      case '24h': return t('24 hours');
      case 'all': return t('All events');
      case 'live': return t('Live');
    }
  };

  if (!page.isAuthenticated) return null;

  return (
    <AppShell title={t('Montage Review')}>
      <main className="flex-1 p-6 overflow-auto flex flex-col gap-6 min-h-0">
        {/* Shared multi-select filter bar (Group / Capturing / etc.) */}
        <div className="flex-shrink-0">
          <MonitorFilterBar
            monitors={allMonitors}
            onChange={setFilteredMonitors}
          />
        </div>

        {/* Toolbar */}
        <div className="space-y-3 flex-shrink-0">
          {/* Range presets */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted me-1">
              {t('Range')}
            </span>
            {rangePresets.map((r) => (
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
                {presetLabel(r.value)}
              </button>
            ))}
          </div>

          {/* Monitor selector + transport */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted me-1">
              {t('Monitors')}
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
                  {clock.isPlaying ? t('Pause') : t('Play')}
                </button>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface/30 border-2 border-border">
                  <FastForward size={12} className="text-text-muted" />
                  {REVIEW_SPEEDS.map((s) => (
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
            {t('Select one or more monitors to review.')}
          </div>
        ) : (
          <div
            dir="ltr"
            className="grid gap-3 flex-shrink-0"
            style={{
              gridTemplateColumns: `repeat(${reviewGridColumns(selectedMonitors.length)}, minmax(0, 1fr))`,
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
          <div className="flex-shrink-0" dir="ltr">
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
