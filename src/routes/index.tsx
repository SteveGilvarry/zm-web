import { createFileRoute } from '@tanstack/react-router';
import {
  Monitor,
  Video,
  Activity,
  Play,
  Pause,
  RefreshCw,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';

import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { Panel } from '@/components/common/Panel';
import { StatCard } from '@/components/console/StatCard';
import { MonitorThumbnail } from '@/components/console/MonitorThumbnail';
import { EventsFeed } from '@/components/console/EventsFeed';
import { SystemStatus } from '@/components/console/SystemStatus';
import { getMonitors, getLiveSessions } from '@/api/monitors';
import { getEvents, getEventCounts } from '@/api/events';
import { getDaemons, getSystemStatus } from '@/api/system';
import { useAuthStore } from '@/stores/auth';

export const Route = createFileRoute('/')({
  component: ConsolePage,
});

function ConsolePage() {
  const { isAuthenticated } = useAuthStore();

  // Fetch monitors
  const { data: monitorsData, isLoading: monitorsLoading } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 50 }),
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  // Fetch live sessions
  const { data: liveSessions = [] } = useQuery({
    queryKey: ['liveSessions'],
    queryFn: getLiveSessions,
    enabled: isAuthenticated,
    refetchInterval: 10000,
  });

  // Fetch recent events
  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ['recentEvents'],
    queryFn: () => getEvents({ page: 1, page_size: 10 }),
    enabled: isAuthenticated,
    refetchInterval: 15000,
  });

  // Fetch event counts
  const { data: eventCounts } = useQuery({
    queryKey: ['eventCounts'],
    queryFn: getEventCounts,
    enabled: isAuthenticated,
    refetchInterval: 60000,
  });

  // Fetch daemons
  const { data: daemonsData } = useQuery({
    queryKey: ['daemons'],
    queryFn: getDaemons,
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  // Fetch system status
  const { data: systemStatusData } = useQuery({
    queryKey: ['systemStatus'],
    queryFn: getSystemStatus,
    enabled: isAuthenticated,
    refetchInterval: 10000,
  });

  const monitors = monitorsData?.data || [];
  const events = eventsData?.data || [];
  const daemons = daemonsData?.daemons || [];

  const activeMonitors = monitors.filter((m) => m.enabled && m.function !== 'None');
  const recordingMonitors = monitors.filter((m) => ['Record', 'Mocord'].includes(m.function));

  // If not authenticated, show login prompt
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-4">Please Login</h1>
          <p className="text-text-muted mb-6">You need to authenticate to access the dashboard.</p>
          <a
            href="/login"
            className="px-6 py-3 bg-cyan text-void font-medium rounded-lg hover:bg-cyan-dim transition-colors"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-void">
      <Sidebar />

      <div className="ml-56 min-h-screen flex flex-col">
        <Header title="Console" />

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
              label="Events Today"
              value={eventCounts?.today || 0}
              icon={<Video size={20} />}
              variant="amber"
              trend={
                eventCounts
                  ? { value: 12, label: 'vs yesterday' }
                  : undefined
              }
            />
            <StatCard
              label="Recording"
              value={recordingMonitors.length}
              icon={<Activity size={20} />}
              variant="crimson"
              subtitle="cameras"
            />
            <StatCard
              label="Streaming"
              value={liveSessions.length}
              icon={<Play size={20} />}
              variant="emerald"
              subtitle="active streams"
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
                  <button className="p-1.5 rounded hover:bg-panel text-text-muted hover:text-text-primary transition-colors">
                    <RefreshCw size={14} />
                  </button>
                }
              >
                {monitorsLoading ? (
                  <div className="grid grid-cols-3 gap-4">
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
                  <div className="grid grid-cols-3 gap-4">
                    {monitors.slice(0, 9).map((monitor) => (
                      <MonitorThumbnail
                        key={monitor.id}
                        monitor={monitor}
                        isStreaming={liveSessions.includes(monitor.id)}
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
                  cpuLoad={systemStatusData?.cpu_load}
                  diskUsage={[]}
                />
              </Panel>

              {/* Recent Events */}
              <Panel
                title="Recent Events"
                icon={<Video size={16} />}
                action={
                  <span className="text-xs font-mono text-text-muted">
                    {eventCounts?.total || 0} total
                  </span>
                }
              >
                <EventsFeed events={events} isLoading={eventsLoading} />
              </Panel>
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="mt-6">
            <Panel noPadding>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-muted">
                    Quick Actions
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <QuickActionButton
                    icon={<Play size={14} />}
                    label="Start All"
                    onClick={() => {}}
                  />
                  <QuickActionButton
                    icon={<Pause size={14} />}
                    label="Stop All"
                    onClick={() => {}}
                    variant="danger"
                  />
                  <QuickActionButton
                    icon={<RefreshCw size={14} />}
                    label="Restart ZM"
                    onClick={() => {}}
                  />
                </div>
              </div>
            </Panel>
          </div>
        </main>
      </div>

      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute inset-0 bg-grid opacity-20" />
      </div>
    </div>
  );
}

function QuickActionButton({
  icon,
  label,
  onClick,
  variant = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg',
        'text-sm font-medium transition-all duration-fast',
        'border',
        variant === 'danger'
          ? 'border-crimson/30 text-crimson hover:bg-crimson/10'
          : 'border-border text-text-secondary hover:text-text-primary hover:bg-panel'
      )}
    >
      {icon}
      {label}
    </button>
  );
}
