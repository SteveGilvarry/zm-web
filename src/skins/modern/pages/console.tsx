import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StreamProtocol, Monitor as MonitorType } from '@/types';
import { isOrientationRotated } from '@/types';
import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { ConsoleStatusLine } from '../components/ConsoleStatusLine';
import { ActivityRail } from '../components/ActivityRail';
import { MonitorThumbnail } from '@/components/console/MonitorThumbnail';
import { EventsFeed } from '@/components/console/EventsFeed';
import { SystemStatus } from '@/components/console/SystemStatus';
import { SkinHint } from '@/components/onboarding/SkinHint';
import { MonitorFilterBar } from '@/features/monitors/MonitorFilterBar';
import { useConsolePage } from '@/features/console/useConsolePage';
import { lookupSummary, type ConsoleData } from '@/features/console/useConsoleData';
import { packWall } from '@/features/console/layout';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/**
 * Console — the camera wall.
 *
 * One status line of chrome, then every camera in the fleet packed into the
 * space that is left. System detail and the filter chips are disclosures on
 * the line; recent events are a rail that collapses. See docs/DESIGN.md.
 */
// The wall reads the filter store directly (useConsolePage), so the bar's
// change callback has nothing left to do here.
const noop = () => {};

export default function ConsolePage() {
  const { t } = useTranslation();
  useDocumentTitle(t('Console'));
  const page = useConsolePage();
  const {
    data, filteredMonitors, activeFilterCount, recordingMonitors,
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

  // ZoneMinder's runtime states; Alarm/Alert are the ones an operator must
  // see without hunting for them.
  const alarmCount = filteredMonitors.filter((m) => {
    const st = data.runtimeById[m.id]?.status;
    return st === 'Alarm' || st === 'Alert';
  }).length;

  return (
    <AppShell title={t('Console')}>
      {/* The wall is the page: no padding, no panel around the cameras, and
          the chrome is one line above them. See docs/DESIGN.md. */}
      <main className="flex-1 min-h-0 min-w-0 flex flex-col">
        <ConsoleStatusLine
          running={isSystemRunning ?? null}
          activeFilters={activeFilterCount}
          protocol={liveProtocol}
          onProtocol={setLiveProtocol}
          readings={[
            {
              label: t('Cameras'),
              value: monitors.length === filteredMonitors.length
                ? `${filteredMonitors.length}`
                : `${filteredMonitors.length}/${monitors.length}`,
            },
            {
              label: t('Recording'),
              value: `${recordingMonitors.length}`,
              mark: recordingMonitors.length > 0
                ? <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-recording self-center" />
                : undefined,
            },
            {
              label: t('Alarms'),
              value: `${alarmCount}`,
              tone: alarmCount > 0 ? 'danger' : 'normal',
            },
            {
              label: t('Events (24h)'),
              value: `${eventCount24h}`,
            },
            {
              label: t('Disk'),
              value: systemStats?.disk_usage_percent != null
                ? `${systemStats.disk_usage_percent.toFixed(0)}%`
                : '—',
              tone: systemStats?.disk_usage_percent == null
                ? 'normal'
                : systemStats.disk_usage_percent > 90
                  ? 'danger'
                  : systemStats.disk_usage_percent > 75
                    ? 'warn'
                    : 'normal',
            },
          ]}
          filterPanel={<MonitorFilterBar monitors={monitors} onChange={noop} />}
          systemPanel={
            <SystemStatus daemons={daemons} isRunning={isSystemRunning} stats={systemStats} />
          }
        />

        <div className="flex-1 min-h-0 flex">
          <section aria-label={t('Cameras')} className="flex-1 min-w-0 min-h-0 p-1">
            <QueryState
              isLoading={loading.monitors}
              isError={data.isError}
              error={data.error}
              onRetry={data.refetch}
              empty={filteredMonitors.length === 0}
              emptyMessage={monitors.length === 0 ? t('No monitors configured') : t('No monitors match the current filter')}
            >
              <RequirePerm feature="stream" level="View" fallback="message">
                <JustifiedMonitorGrid
                  monitors={filteredMonitors}
                  liveSessions={liveSessions}
                  liveProtocol={liveProtocol}
                  data={data}
                />
              </RequirePerm>
            </QueryState>
          </section>

          <ActivityRail
            title={t('Recent Events')}
            total={`${eventCount24h}`}
            footerHref="/events"
            footerLabel={t('All events →')}
          >
            <EventsFeed events={events} isLoading={loading.events} />
          </ActivityRail>
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
  const [box, setBox] = useState({ width: 0, height: 0 });

  // The shell's content column is exactly one viewport tall, so the
  // element's own box is the space the wall has. The viewport fallback
  // covers a shell that has not laid out yet.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const height = r.height > 0 ? r.height : Math.max(0, window.innerHeight - r.top - 8);
      setBox({ width: r.width, height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Tiles + their displayed (post-rotation) aspect.
  const tiles = monitors.map((m) => {
    const rotated = isOrientationRotated(m.orientation);
    const rawW = m.width  || 16;
    const rawH = m.height || 9;
    const aspect = rotated ? rawH / rawW : rawW / rawH;
    return { data: m, aspect };
  });

  // Don't compute until we know the container size — avoids a flash of
  // mis-sized tiles before the first ResizeObserver entry lands.
  //
  // A wall you have to scroll is not a wall: `packWall` chooses the row
  // count that makes the cameras as large as they can be inside the space
  // that is actually on screen.
  const rows = packWall(tiles, box.width, box.height, { gap: GAP, ribbon: RIBBON_HEIGHT });

  return (
    <div ref={containerRef} className="h-full overflow-auto flex flex-col justify-center gap-4">
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="flex gap-4 justify-center">
          {row.tiles.map(({ data: monitor, width }) => (
            <MonitorThumbnail
              key={monitor.id}
              monitor={monitor}
              isStreaming={liveSessions.includes(monitor.id)}
              liveProtocol={liveProtocol}
              summary={lookupSummary(data.summariesByMonitor, monitor.id)}
              hourly={data.hourlyByMonitor[monitor.id]}
              runtime={data.runtimeById[monitor.id]}
              width={width}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Height of the name + activity ribbon under each tile's video: one text
 * row, the 24h spark, the counters, and the padding around them. Measured
 * rather than guessed — the packer subtracts it per row, so an estimate
 * that is too small pushes the bottom row off the frame.
 */
const RIBBON_HEIGHT = 64;
const GAP = 16;

