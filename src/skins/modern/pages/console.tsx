import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  Monitor,
  Video,
  Activity,
  Wifi,
  Radio,
  VideoOff,
  HardDrive,
} from 'lucide-react';
import type { StreamProtocol, Monitor as MonitorType } from '@/types';
import { isOrientationRotated } from '@/types';
import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { StatCard } from '@/components/console/StatCard';
import { MonitorThumbnail } from '@/components/console/MonitorThumbnail';
import { EventsFeed } from '@/components/console/EventsFeed';
import { SystemStatus } from '@/components/console/SystemStatus';
import { SkinHint } from '@/components/onboarding/SkinHint';
import { MonitorFilterBar } from '@/features/monitors/MonitorFilterBar';
import { formatGB, useConsolePage } from '@/features/console/useConsolePage';
import { lookupSummary, type ConsoleData } from '@/features/console/useConsoleData';
import { justifyRows } from '@/features/console/layout';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/** Console — Mission Control: stat cards + justified thumbnail grid + sidebar. */
export default function ConsolePage() {
  const { t } = useTranslation();
  useDocumentTitle(t('Console'));
  const page = useConsolePage();
  const {
    data, filteredMonitors, setFilteredMonitors, activeMonitors, recordingMonitors,
    liveProtocol, setLiveProtocol,
  } = page;
  const {
    monitors,
    liveSessions,
    events,
    eventCount24h,
    daemons,
    isSystemRunning,
    systemStats,
    loading,
  } = data;

  if (!page.isAuthenticated) return null;

  return (
    <AppShell title={t('Console')}>
      <main className="flex-1 p-6 overflow-auto">
        {/* Filter bar — shared across Console / Montage / Montage Review. */}
        <div className="mb-4">
          <MonitorFilterBar monitors={monitors} onChange={setFilteredMonitors} />
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4 mb-6 stagger-children">
          <StatCard
            label={t('Monitors')}
            value={filteredMonitors.length}
            icon={<Monitor size={20} />}
            variant="cyan"
            subtitle={t('{{count}} active', { count: activeMonitors.length })}
          />
          <StatCard
            label={t('Events (24h)')}
            value={eventCount24h}
            icon={<Video size={20} />}
            variant="amber"
            subtitle={t('events')}
          />
          <StatCard
            label={t('Recording')}
            value={recordingMonitors.length}
            icon={<Activity size={20} />}
            variant="crimson"
            subtitle={t('cameras')}
          />
          <StatCard
            label={t('Storage')}
            value={systemStats?.disk_usage_percent != null
              ? `${systemStats.disk_usage_percent.toFixed(0)}%`
              : '—'}
            icon={<HardDrive size={20} />}
            variant={
              systemStats?.disk_usage_percent != null && systemStats.disk_usage_percent > 90
                ? 'crimson'
                : systemStats?.disk_usage_percent != null && systemStats.disk_usage_percent > 75
                  ? 'amber'
                  : 'emerald'
            }
            subtitle={
              systemStats?.free_disk != null
                ? t('{{size}} free', { size: formatGB(systemStats.free_disk) })
                : t('disk capacity')
            }
          />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-12 gap-6">
          {/* Monitor Grid - takes 8 columns */}
          <div className="col-span-8">
            <Panel
              title={t('Monitors')}
              icon={<Monitor size={16} />}
              action={
                <div className="flex items-center gap-1 bg-surface rounded p-0.5 border border-border-subtle">
                  <button
                    onClick={() => setLiveProtocol('webrtc')}
                    className={clsx(
                      'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all',
                      liveProtocol === 'webrtc'
                        ? 'bg-cyan/20 text-cyan'
                        : 'text-text-muted hover:text-text-primary',
                    )}
                    title={t('WebRTC live thumbnails')}
                  >
                    <Wifi size={10} />
                    RTC
                  </button>
                  <button
                    onClick={() => setLiveProtocol('hls')}
                    className={clsx(
                      'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all',
                      liveProtocol === 'hls'
                        ? 'bg-cyan/20 text-cyan'
                        : 'text-text-muted hover:text-text-primary',
                    )}
                    title={t('HLS live thumbnails')}
                  >
                    <Radio size={10} />
                    HLS
                  </button>
                  <button
                    onClick={() => setLiveProtocol(null)}
                    className={clsx(
                      'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all',
                      liveProtocol === null
                        ? 'bg-text-muted/20 text-text-secondary'
                        : 'text-text-muted hover:text-text-primary',
                    )}
                    title={t('Static thumbnails (no streaming)')}
                  >
                    <VideoOff size={10} />
                    {t('Off')}
                  </button>
                </div>
              }
            >
              {loading.monitors ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className="aspect-video rounded-lg bg-panel animate-pulse"
                    />
                  ))}
                </div>
              ) : filteredMonitors.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-text-muted">
                  <Monitor size={48} className="mb-4 opacity-50" />
                  <p>
                    {monitors.length === 0
                      ? t('No monitors configured')
                      : t('No monitors match the current filter')}
                  </p>
                </div>
              ) : (
                <JustifiedMonitorGrid
                  monitors={filteredMonitors.slice(0, 9)}
                  liveSessions={liveSessions}
                  liveProtocol={liveProtocol}
                  data={data}
                />
              )}

              {filteredMonitors.length > 9 && (
                <div className="mt-4 text-center">
                  <a
                    href="/monitors"
                    className="text-sm text-cyan hover:text-cyan-dim transition-colors"
                  >
                    {t('View all {{count}} monitors →', { count: filteredMonitors.length })}
                  </a>
                </div>
              )}
            </Panel>
          </div>

          {/* Right sidebar - takes 4 columns */}
          <div className="col-span-4 space-y-6">
            {/* System Status */}
            <Panel title={t('System')} icon={<Activity size={16} />}>
              <SystemStatus
                daemons={daemons}
                isRunning={isSystemRunning}
                stats={systemStats}
              />
            </Panel>

            {/* Recent Events */}
            <Panel
              title={t('Recent Events')}
              icon={<Video size={16} />}
              action={
                <span className="text-xs font-mono text-text-muted">
                  {t('{{count}} total', { count: eventCount24h })}
                </span>
              }
            >
              <EventsFeed events={events} isLoading={loading.events} />
            </Panel>
          </div>
        </div>
      </main>
      <SkinHint />
    </AppShell>
  );
}

/* ------------------------------------------------------------------------ */
/*  Justified-row monitor grid                                              */
/* ------------------------------------------------------------------------ */

interface JustifiedMonitorGridProps {
  monitors: MonitorType[];
  liveSessions: number[];
  liveProtocol: StreamProtocol | null;
  data: ConsoleData;
}

/**
 * Aspect-constrained rectangle packing for the Console monitor grid.
 *
 * Each tile's aspect ratio comes from the camera's true (post-rotation)
 * displayed shape. The justifyRows() algorithm groups tiles into rows
 * such that every row's tiles share one height H, chosen so the row's
 * total width exactly equals the container width minus gaps. Standard
 * Flickr / Google-Photos justified layout.
 *
 * ResizeObserver tracks the container width; the layout recomputes on
 * every width change. The activity ribbon below each video adds a
 * fixed height that the algorithm doesn't see — rows end up
 * (algoHeight + ribbonHeight) tall, which is fine because every tile
 * in a row picks up the same fixed ribbon below.
 */
function JustifiedMonitorGrid({
  monitors,
  liveSessions,
  liveProtocol,
  data,
}: JustifiedMonitorGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      // Use contentRect for the inner width (excluding padding).
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Tiles + their displayed (post-rotation) aspect.
  const tiles = monitors.map((m) => {
    const rotated = isOrientationRotated(m.orientation);
    const rawW = m.width  || 16;
    const rawH = m.height || 9;
    const aspect = rotated ? rawH / rawW : rawW / rawH;
    return { data: m, aspect };
  });

  // Don't compute until we know the container width — avoids a flash
  // of mis-sized tiles before the first ResizeObserver entry lands.
  const rows = containerWidth > 0
    ? justifyRows(tiles, containerWidth, {
        targetHeight: 360,
        maxHeight: 560,
        gap: 16,
      })
    : [];

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="flex gap-4">
          {row.tiles.map(({ data: monitor, width }) => (
            <MonitorThumbnail
              key={monitor.id}
              monitor={monitor}
              isStreaming={liveSessions.includes(monitor.id)}
              liveProtocol={liveProtocol}
              summary={lookupSummary(data.summariesByMonitor, monitor.id)}
              hourly={data.hourlyByMonitor[monitor.id]}
              width={width}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
