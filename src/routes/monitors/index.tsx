import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  Monitor,
  Search,
  Grid3X3,
  List,
  Filter,
  RefreshCw,
  Video,
  VideoOff,
  Circle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { Panel } from '@/components/common/Panel';
import { getMonitors, getLiveSessions } from '@/api/monitors';
import { useAuthStore } from '@/stores/auth';
import type { Monitor as MonitorType, MonitorFunction } from '@/types';
import { getMonitorFunction } from '@/types';

export const Route = createFileRoute('/monitors/')({
  component: MonitorsPage,
});

type ViewMode = 'grid' | 'list';
type FunctionFilter = 'all' | MonitorFunction;
type StatusFilter = 'all' | 'enabled' | 'disabled' | 'streaming';

const functionColors: Record<MonitorFunction, string> = {
  None: 'bg-text-muted/20 text-text-muted',
  Monitor: 'bg-cyan/20 text-cyan',
  Modect: 'bg-amber/20 text-amber',
  Record: 'bg-crimson/20 text-crimson',
  Mocord: 'bg-purple/20 text-purple',
  Nodect: 'bg-text-secondary/20 text-text-secondary',
};

const functionLabels: Record<MonitorFunction, string> = {
  None: 'None',
  Monitor: 'Monitor',
  Modect: 'Motion Detect',
  Record: 'Record',
  Mocord: 'Motion + Record',
  Nodect: 'No Detect',
};

function MonitorsPage() {
  const { isAuthenticated } = useAuthStore();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [functionFilter, setFunctionFilter] = useState<FunctionFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const pageSize = 24;

  const { data: monitorsData, isLoading, refetch } = useQuery({
    queryKey: ['monitors', page, pageSize],
    queryFn: () => getMonitors({ page, page_size: pageSize }),
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  const { data: liveSessions = [] } = useQuery({
    queryKey: ['liveSessions'],
    queryFn: getLiveSessions,
    enabled: isAuthenticated,
    refetchInterval: 10000,
  });

  const monitors = monitorsData?.items || [];
  const totalPages = monitorsData?.last_page || 1;

  const filteredMonitors = useMemo(() => {
    return monitors.filter((monitor) => {
      // Search filter
      if (searchQuery && !monitor.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      // Function filter
      if (functionFilter !== 'all' && monitor.function !== functionFilter) {
        return false;
      }

      // Status filter
      if (statusFilter === 'enabled' && monitor.enabled !== 1) {
        return false;
      }
      if (statusFilter === 'disabled' && monitor.enabled === 1) {
        return false;
      }
      if (statusFilter === 'streaming' && !liveSessions.includes(monitor.id)) {
        return false;
      }

      return true;
    });
  }, [monitors, searchQuery, functionFilter, statusFilter, liveSessions]);

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-void">
      <Sidebar />

      <div className="ml-56 min-h-screen flex flex-col">
        <Header title="Monitors" />

        <main className="flex-1 p-6 overflow-auto">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search monitors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={clsx(
                    'pl-10 pr-4 py-2 w-64',
                    'bg-surface border border-border-subtle rounded-lg',
                    'text-text-primary placeholder:text-text-muted',
                    'focus:outline-none focus:border-cyan/50',
                    'transition-colors'
                  )}
                />
              </div>

              {/* Function Filter */}
              <div className="relative">
                <select
                  value={functionFilter}
                  onChange={(e) => setFunctionFilter(e.target.value as FunctionFilter)}
                  className={clsx(
                    'pl-3 pr-8 py-2 appearance-none',
                    'bg-surface border border-border-subtle rounded-lg',
                    'text-text-primary',
                    'focus:outline-none focus:border-cyan/50',
                    'transition-colors cursor-pointer'
                  )}
                >
                  <option value="all">All Functions</option>
                  <option value="None">None</option>
                  <option value="Monitor">Monitor</option>
                  <option value="Modect">Motion Detect</option>
                  <option value="Record">Record</option>
                  <option value="Mocord">Motion + Record</option>
                  <option value="Nodect">No Detect</option>
                </select>
                <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1 p-1 bg-surface border border-border-subtle rounded-lg">
                {(['all', 'enabled', 'disabled', 'streaming'] as StatusFilter[]).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={clsx(
                      'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                      statusFilter === status
                        ? 'bg-cyan/20 text-cyan'
                        : 'text-text-muted hover:text-text-primary'
                    )}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Refresh */}
              <button
                onClick={() => refetch()}
                className="p-2 rounded-lg bg-surface border border-border-subtle text-text-muted hover:text-text-primary hover:border-cyan/50 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              {/* View Toggle */}
              <div className="flex items-center gap-1 p-1 bg-surface border border-border-subtle rounded-lg">
                <button
                  onClick={() => setViewMode('grid')}
                  className={clsx(
                    'p-2 rounded-md transition-colors',
                    viewMode === 'grid'
                      ? 'bg-cyan/20 text-cyan'
                      : 'text-text-muted hover:text-text-primary'
                  )}
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={clsx(
                    'p-2 rounded-md transition-colors',
                    viewMode === 'list'
                      ? 'bg-cyan/20 text-cyan'
                      : 'text-text-muted hover:text-text-primary'
                  )}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Monitor Count */}
          <div className="mb-4 text-sm text-text-muted">
            Showing {filteredMonitors.length} of {monitors.length} monitors
            {monitorsData?.total && monitorsData.total > monitors.length && (
              <span> ({monitorsData.total} total)</span>
            )}
          </div>

          {/* Content */}
          {isLoading ? (
            <div className={clsx(
              viewMode === 'grid'
                ? 'grid grid-cols-4 gap-4'
                : 'flex flex-col gap-3'
            )}>
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className={clsx(
                    'bg-surface border border-border-subtle rounded-xl animate-pulse',
                    viewMode === 'grid' ? 'aspect-video' : 'h-20'
                  )}
                />
              ))}
            </div>
          ) : filteredMonitors.length === 0 ? (
            <Panel>
              <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                <Monitor size={48} className="mb-4 opacity-50" />
                <p className="text-lg">No monitors found</p>
                <p className="text-sm mt-1">Try adjusting your filters</p>
              </div>
            </Panel>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-4 gap-4 stagger-children">
              {filteredMonitors.map((monitor) => (
                <MonitorCard
                  key={monitor.id}
                  monitor={monitor}
                  isStreaming={liveSessions.includes(monitor.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2 stagger-children">
              {filteredMonitors.map((monitor) => (
                <MonitorListItem
                  key={monitor.id}
                  monitor={monitor}
                  isStreaming={liveSessions.includes(monitor.id)}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className={clsx(
                  'p-2 rounded-lg border transition-colors',
                  page === 1
                    ? 'bg-surface border-border-subtle text-text-muted cursor-not-allowed'
                    : 'bg-surface border-border-subtle text-text-primary hover:border-cyan/50'
                )}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={clsx(
                        'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                        page === pageNum
                          ? 'bg-cyan text-void'
                          : 'bg-surface border border-border-subtle text-text-secondary hover:text-text-primary hover:border-cyan/50'
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className={clsx(
                  'p-2 rounded-lg border transition-colors',
                  page === totalPages
                    ? 'bg-surface border-border-subtle text-text-muted cursor-not-allowed'
                    : 'bg-surface border-border-subtle text-text-primary hover:border-cyan/50'
                )}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute inset-0 bg-grid opacity-20" />
      </div>
    </div>
  );
}

function MonitorCard({
  monitor,
  isStreaming,
}: {
  monitor: MonitorType;
  isStreaming: boolean;
}) {
  const monitorFn = getMonitorFunction(monitor.function);
  const isEnabled = monitor.enabled === 1 && monitorFn !== 'None';

  return (
    <Link
      to="/monitors/$monitorId"
      params={{ monitorId: String(monitor.id) }}
      className={clsx(
        'group relative block rounded-xl overflow-hidden',
        'bg-surface border border-border-subtle',
        'transition-all duration-base',
        'hover:border-cyan/50 hover:shadow-lg hover:shadow-cyan/10'
      )}
    >
      {/* Video placeholder */}
      <div className="aspect-video relative bg-abyss">
        {isEnabled ? (
          <>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-text-dim">
                {isStreaming ? (
                  <div className="relative">
                    <Video size={32} className="text-cyan/40" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Circle className="w-2 h-2 fill-crimson text-crimson animate-pulse" />
                    </div>
                  </div>
                ) : (
                  <Video size={32} />
                )}
              </div>
            </div>

            <div className="absolute inset-0 scanlines pointer-events-none" />

            {isStreaming && (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded bg-black/60">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-crimson opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-crimson" />
                </span>
                <span className="text-xs font-mono font-bold text-white">LIVE</span>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <VideoOff size={32} className="text-text-dim" />
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />
      </div>

      {/* Info */}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={clsx(
                'flex-shrink-0 w-2 h-2 rounded-full',
                isEnabled ? 'bg-emerald' : 'bg-text-muted'
              )}
            />
            <span className="text-sm font-medium text-white truncate">
              {monitor.name}
            </span>
          </div>
          <span className="text-xs font-mono text-text-muted">
            #{monitor.id}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span
            className={clsx(
              'text-[10px] font-mono font-medium px-1.5 py-0.5 rounded',
              functionColors[monitorFn]
            )}
          >
            {functionLabels[monitorFn]}
          </span>
          <span className="text-[10px] font-mono text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
            {monitor.width}x{monitor.height}
          </span>
        </div>
      </div>
    </Link>
  );
}

function MonitorListItem({
  monitor,
  isStreaming,
}: {
  monitor: MonitorType;
  isStreaming: boolean;
}) {
  const monitorFn = getMonitorFunction(monitor.function);
  const isEnabled = monitor.enabled === 1 && monitorFn !== 'None';

  return (
    <Link
      to="/monitors/$monitorId"
      params={{ monitorId: String(monitor.id) }}
      className={clsx(
        'flex items-center gap-4 p-4',
        'bg-surface border border-border-subtle rounded-xl',
        'transition-all duration-base',
        'hover:border-cyan/50 hover:shadow-lg hover:shadow-cyan/10'
      )}
    >
      {/* Thumbnail */}
      <div className="w-32 aspect-video relative rounded-lg overflow-hidden bg-abyss flex-shrink-0">
        {isEnabled ? (
          <>
            <div className="absolute inset-0 flex items-center justify-center">
              <Video size={20} className="text-text-dim" />
            </div>
            {isStreaming && (
              <div className="absolute top-1 left-1 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-crimson opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-crimson" />
                </span>
                <span className="text-[10px] font-mono font-bold text-white">LIVE</span>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <VideoOff size={20} className="text-text-dim" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={clsx(
              'w-2 h-2 rounded-full',
              isEnabled ? 'bg-emerald' : 'bg-text-muted'
            )}
          />
          <h3 className="font-medium text-text-primary truncate">
            {monitor.name}
          </h3>
          <span className="text-xs font-mono text-text-muted">
            #{monitor.id}
          </span>
        </div>

        <div className="flex items-center gap-3 text-sm text-text-secondary">
          <span
            className={clsx(
              'text-xs font-mono font-medium px-2 py-0.5 rounded',
              functionColors[monitorFn]
            )}
          >
            {functionLabels[monitorFn]}
          </span>
          <span className="font-mono text-text-muted">
            {monitor.width}x{monitor.height}
          </span>
          {monitor.type && (
            <span className="text-text-muted">{monitor.type}</span>
          )}
        </div>
      </div>

      {/* Status indicators */}
      <div className="flex items-center gap-3 text-text-muted">
        {isStreaming && (
          <div className="flex items-center gap-1.5 text-crimson">
            <Circle className="w-2 h-2 fill-current" />
            <span className="text-xs font-mono">Streaming</span>
          </div>
        )}
        {monitor.enabled === 1 ? (
          <span className="text-xs text-emerald">Enabled</span>
        ) : (
          <span className="text-xs text-text-muted">Disabled</span>
        )}
      </div>
    </Link>
  );
}
