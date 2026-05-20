import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useRef, useCallback, useEffect } from 'react';
import { clsx } from 'clsx';
import {
  Play,
  Square,
  Maximize2,
  Wifi,
  Radio,
  Monitor,
  Info,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { StreamCell } from '@/components/common/StreamCell';
import { getMonitors } from '@/api/monitors';
import { useAuthStore } from '@/stores/auth';
import { useMontageStore } from '@/stores/montage';
import type { GridLayout } from '@/types';

export const Route = createFileRoute('/montage/')({
  component: MontagePage,
});

const layoutOptions: { value: GridLayout; label: string; cols: number }[] = [
  { value: '1x1', label: '1×1', cols: 1 },
  { value: '2x2', label: '2×2', cols: 2 },
  { value: '3x3', label: '3×3', cols: 3 },
  { value: '4x4', label: '4×4', cols: 4 },
];

function getGridCols(layout: GridLayout): number {
  return parseInt(layout[0], 10);
}

function MontagePage() {
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const gridRef = useRef<HTMLDivElement>(null);

  const {
    layout,
    protocol,
    selectedMonitorIds,
    isStreamingAll,
    setLayout,
    setProtocol,
    setSelectedMonitorIds,
    setStreamingAll,
  } = useMontageStore();

  const cols = getGridCols(layout);
  const totalCells = cols * cols;

  // Fetch all monitors
  const { data: monitorsData } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 50 }),
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  const monitors = monitorsData?.items || [];
  const enabledMonitors = monitors.filter(
    (m) => m.capturing !== 'None'
  );

  // Auto-populate selectedMonitorIds when monitors load
  useEffect(() => {
    if (selectedMonitorIds.length === 0 && enabledMonitors.length > 0) {
      setSelectedMonitorIds(enabledMonitors.slice(0, totalCells).map((m) => m.id));
    }
  }, [enabledMonitors.length, selectedMonitorIds.length, totalCells, setSelectedMonitorIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get monitors to show in grid (limited to totalCells)
  const gridMonitors = selectedMonitorIds
    .slice(0, totalCells)
    .map((id) => monitors.find((m) => m.id === id))
    .filter(Boolean);

  const handleStartAll = () => {
    setStreamingAll(true);
  };

  const handleStopAll = () => {
    setStreamingAll(false);
  };

  const handleProtocolChange = (newProtocol: 'webrtc' | 'hls') => {
    if (newProtocol === protocol) return;
    // Stop all streams before switching protocol
    setStreamingAll(false);
    // Small delay so components unmount cleanly, then set new protocol
    setTimeout(() => setProtocol(newProtocol), 100);
  };

  const handleLayoutChange = (newLayout: GridLayout) => {
    if (newLayout === layout) return;
    const newCols = getGridCols(newLayout);
    const newTotal = newCols * newCols;
    setLayout(newLayout);
    // Expand selection if we have more cells now
    if (selectedMonitorIds.length < newTotal && enabledMonitors.length > selectedMonitorIds.length) {
      const additionalIds = enabledMonitors
        .filter((m) => !selectedMonitorIds.includes(m.id))
        .slice(0, newTotal - selectedMonitorIds.length)
        .map((m) => m.id);
      setSelectedMonitorIds([...selectedMonitorIds, ...additionalIds]);
    }
  };

  const handleFullscreen = useCallback(() => {
    if (gridRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        gridRef.current.requestFullscreen();
      }
    }
  }, []);

  const handleCellClick = (monitorId: number) => {
    navigate({ to: '/monitors/$monitorId', params: { monitorId: String(monitorId) } });
  };

  const handleCellDoubleClick = (monitorId: number) => {
    // Find the video element in the cell and fullscreen it
    const cell = gridRef.current?.querySelector(`[data-monitor-id="${monitorId}"] video`);
    if (cell instanceof HTMLVideoElement) {
      cell.requestFullscreen().catch(() => {});
    }
  };

  if (!isAuthenticated) return null;

  return (
    <AppShell title="Montage">
      <main className="flex-1 p-6 overflow-auto flex flex-col">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              {/* Layout selector */}
              <div className="flex items-center gap-1 bg-surface rounded-lg p-1 border border-border-subtle">
                {layoutOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleLayoutChange(opt.value)}
                    className={clsx(
                      'px-3 py-1.5 rounded text-xs font-mono font-medium transition-all duration-fast',
                      layout === opt.value
                        ? 'bg-cyan/20 text-cyan'
                        : 'text-text-muted hover:text-text-primary',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Protocol toggle */}
              <div className="flex items-center gap-1 bg-surface rounded-lg p-1 border border-border-subtle">
                <button
                  onClick={() => handleProtocolChange('webrtc')}
                  className={clsx(
                    'flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-all duration-fast',
                    protocol === 'webrtc'
                      ? 'bg-cyan/20 text-cyan'
                      : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  <Wifi size={12} />
                  WebRTC
                </button>
                <button
                  onClick={() => handleProtocolChange('hls')}
                  className={clsx(
                    'flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-all duration-fast',
                    protocol === 'hls'
                      ? 'bg-cyan/20 text-cyan'
                      : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  <Radio size={12} />
                  HLS
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* 4x4 performance hint */}
              {layout === '4x4' && protocol === 'webrtc' && (
                <div className="flex items-center gap-1 text-[10px] text-amber font-mono">
                  <Info size={12} />
                  HLS recommended for 4×4
                </div>
              )}

              {/* Start/Stop All */}
              {isStreamingAll ? (
                <button
                  onClick={handleStopAll}
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2 rounded-lg',
                    'text-sm font-medium transition-all duration-fast',
                    'bg-crimson/20 text-crimson border border-crimson/30',
                    'hover:bg-crimson/30',
                  )}
                >
                  <Square size={14} />
                  Stop All
                </button>
              ) : (
                <button
                  onClick={handleStartAll}
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2 rounded-lg',
                    'text-sm font-medium transition-all duration-fast',
                    'bg-cyan text-void',
                    'hover:bg-cyan-dim',
                  )}
                >
                  <Play size={14} />
                  Start All
                </button>
              )}

              {/* Fullscreen */}
              <button
                onClick={handleFullscreen}
                className={clsx(
                  'p-2 rounded-lg border border-border text-text-muted',
                  'hover:text-text-primary hover:bg-panel transition-colors',
                )}
                title="Fullscreen grid"
              >
                <Maximize2 size={16} />
              </button>
            </div>
          </div>

          {/* Grid */}
          <div
            ref={gridRef}
            className={clsx(
              'grid gap-2 flex-1',
              cols === 1 && 'grid-cols-1',
              cols === 2 && 'grid-cols-2',
              cols === 3 && 'grid-cols-3',
              cols === 4 && 'grid-cols-4',
              'bg-void',
            )}
          >
            {Array.from({ length: totalCells }).map((_, idx) => {
              const monitor = gridMonitors[idx];

              if (!monitor) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="aspect-video bg-abyss rounded-lg border border-border-subtle flex items-center justify-center"
                  >
                    <div className="text-center text-text-dim">
                      <Monitor size={24} className="mx-auto mb-1 opacity-30" />
                      <span className="text-[10px] font-mono">No monitor</span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={monitor.id}
                  data-monitor-id={monitor.id}
                  className="aspect-video rounded-lg border border-border-subtle overflow-hidden"
                >
                  <StreamCell
                    protocol={protocol}
                    monitorId={monitor.id}
                    monitorName={monitor.name}
                    orientation={monitor.orientation}
                    autoStart={isStreamingAll}
                    compact={cols >= 3}
                    showControls={cols <= 2}
                    onClick={() => handleCellClick(monitor.id)}
                    onDoubleClick={() => handleCellDoubleClick(monitor.id)}
                  />
                </div>
              );
            })}
          </div>

          {/* Status bar */}
          <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-text-dim flex-shrink-0">
            <span>
              {gridMonitors.length} / {enabledMonitors.length} monitors
            </span>
            <span>
              {layout} &middot; {protocol.toUpperCase()}
            </span>
          </div>
      </main>
    </AppShell>
  );
}
