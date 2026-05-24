import { createFileRoute } from '@tanstack/react-router';
import {
  Monitor,
  Video,
  Activity,
  Wifi,
  Radio,
  VideoOff,
  HardDrive,
} from 'lucide-react';
import { useState } from 'react';
import { clsx } from 'clsx';
import type { StreamProtocol } from '@/types';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { StatCard } from '@/components/console/StatCard';
import { MonitorThumbnail } from '@/components/console/MonitorThumbnail';
import { EventsFeed } from '@/components/console/EventsFeed';
import { SystemStatus } from '@/components/console/SystemStatus';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { useConsoleData, type ConsoleData, lookupCount } from '@/features/console/useConsoleData';
import { ConsoleClassicTable } from '@/features/console/ConsoleClassicTable';
import { SkinHint } from '@/components/onboarding/SkinHint';

export const Route = createFileRoute('/')({
  component: ConsolePage,
});

function ConsolePage() {
  const { isAuthenticated } = useAuthStore();
  const skin = useUiStore((s) => s.skin);
  const data = useConsoleData();

  if (!isAuthenticated) return null;

  return (
    <AppShell title="Console">
      {skin === 'classic' ? (
        <ConsoleClassic data={data} />
      ) : (
        <>
          <ConsoleModern data={data} />
          <SkinHint />
        </>
      )}
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Modern — stat cards + thumbnail grid + sidebar (existing layout)          */
/* -------------------------------------------------------------------------- */

function ConsoleModern({ data }: { data: ConsoleData }) {
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

  const [liveProtocol, setLiveProtocol] = useState<StreamProtocol | null>('webrtc');

  const activeMonitors = monitors.filter((m) => m.capturing !== 'None');
  const recordingMonitors = monitors.filter((m) =>
    ['OnMotion', 'Always'].includes(m.recording),
  );

  return (
    <main className="flex-1 p-6 overflow-auto">
      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4 mb-6 stagger-children">
        <StatCard
          label="Monitors"
          value={monitors.length}
          icon={<Monitor size={20} />}
          variant="cyan"
          subtitle={`${activeMonitors.length} active`}
        />
        <StatCard
          label="Events (24h)"
          value={eventCount24h}
          icon={<Video size={20} />}
          variant="amber"
          subtitle="events"
        />
        <StatCard
          label="Recording"
          value={recordingMonitors.length}
          icon={<Activity size={20} />}
          variant="crimson"
          subtitle="cameras"
        />
        <StatCard
          label="Storage"
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
              ? `${formatGB(systemStats.free_disk)} free`
              : 'disk capacity'
          }
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Monitor Grid - takes 8 columns */}
        <div className="col-span-8">
          <Panel
            title="Monitors"
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
                  title="WebRTC live thumbnails"
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
                  title="HLS live thumbnails"
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
                  title="Static thumbnails (no streaming)"
                >
                  <VideoOff size={10} />
                  Off
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
            ) : monitors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-text-muted">
                <Monitor size={48} className="mb-4 opacity-50" />
                <p>No monitors configured</p>
              </div>
            ) : (
              // Aspect-aware grid: each tile sets its own row-span based on
              // the camera's natural aspect ratio, then grid-auto-flow:dense
              // packs short tiles into the gaps left by tall ones. Columns
              // are pinned to a fixed width so the row-span math (which
              // depends on column width) stays exact.
              <div
                className={clsx(
                  'grid gap-4 justify-center',
                  'grid-cols-[repeat(auto-fill,280px)]',
                )}
                style={{
                  gridAutoRows: '24px',
                  gridAutoFlow: 'dense',
                }}
              >
                {monitors.slice(0, 9).map((monitor) => (
                  <MonitorThumbnail
                    key={monitor.id}
                    monitor={monitor}
                    isStreaming={liveSessions.includes(monitor.id)}
                    liveProtocol={liveProtocol}
                    counts={{
                      hour: lookupCount(data.countsByMonitor.hour, monitor.id),
                      day:  lookupCount(data.countsByMonitor.day,  monitor.id),
                      week: lookupCount(data.countsByMonitor.week, monitor.id),
                    }}
                  />
                ))}
              </div>
            )}

            {monitors.length > 9 && (
              <div className="mt-4 text-center">
                <a
                  href="/monitors"
                  className="text-sm text-cyan hover:text-cyan-dim transition-colors"
                >
                  View all {monitors.length} monitors →
                </a>
              </div>
            )}
          </Panel>
        </div>

        {/* Right sidebar - takes 4 columns */}
        <div className="col-span-4 space-y-6">
          {/* System Status */}
          <Panel title="System" icon={<Activity size={16} />}>
            <SystemStatus
              daemons={daemons}
              isRunning={isSystemRunning}
              stats={systemStats}
            />
          </Panel>

          {/* Recent Events */}
          <Panel
            title="Recent Events"
            icon={<Video size={16} />}
            action={
              <span className="text-xs font-mono text-text-muted">
                {eventCount24h} total
              </span>
            }
          >
            <EventsFeed events={events} isLoading={loading.events} />
          </Panel>
        </div>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Classic — legacy ZM table layout (sortable monitor rows)                  */
/* -------------------------------------------------------------------------- */

function ConsoleClassic({ data }: { data: ConsoleData }) {
  return (
    <main className="flex-1 p-4 overflow-auto bg-zinc-50">
      <div className="max-w-screen-2xl mx-auto space-y-4">
        <h1 className="text-xl text-zinc-800 font-semibold">Console</h1>
        <ConsoleClassicTable data={data} />
      </div>
    </main>
  );
}

function formatGB(bytes: number): string {
  if (!bytes) return '0 GB';
  const gb = bytes / (1024 ** 3);
  return gb >= 100 ? `${gb.toFixed(0)} GB` : `${gb.toFixed(1)} GB`;
}
