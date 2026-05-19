import { clsx } from 'clsx';
import { Video, VideoOff, AlertTriangle, Circle } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import type { Monitor, StreamProtocol } from '@/types';
import { StreamCell } from '@/components/common/StreamCell';

interface MonitorThumbnailProps {
  monitor: Monitor;
  isStreaming?: boolean;
  hasMotion?: boolean;
  hasAlarm?: boolean;
  liveProtocol?: StreamProtocol | null;
}

export function MonitorThumbnail({
  monitor,
  isStreaming = false,
  hasMotion = false,
  hasAlarm = false,
  liveProtocol = null,
}: MonitorThumbnailProps) {
  const isEnabled = monitor.capturing !== 'None';

  return (
    <Link
      to="/monitors/$monitorId"
      params={{ monitorId: String(monitor.id) }}
      className={clsx(
        'group relative block rounded-lg overflow-hidden',
        'bg-abyss border border-border-subtle',
        'transition-all duration-base',
        'hover:border-cyan/50 hover:shadow-lg hover:shadow-cyan/10',
        hasAlarm && 'border-crimson animate-pulse'
      )}
    >
      {/* Video placeholder / thumbnail */}
      <div className="aspect-video relative bg-void">
        {isEnabled && liveProtocol ? (
          <>
            {/* Live video stream — absolute to fill aspect-video parent */}
            <div className="absolute inset-0">
              <StreamCell
                protocol={liveProtocol}
                monitorId={monitor.id}
                orientation={monitor.orientation}
                autoStart
                compact
              />
            </div>

            {/* Motion/Alarm indicator (on top of stream) */}
            {(hasMotion || hasAlarm) && (
              <div
                className={clsx(
                  'absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded z-10',
                  hasAlarm ? 'bg-crimson/80' : 'bg-amber/80'
                )}
              >
                <AlertTriangle size={12} className="text-white" />
                <span className="text-xs font-bold text-white">
                  {hasAlarm ? 'ALARM' : 'MOTION'}
                </span>
              </div>
            )}
          </>
        ) : isEnabled ? (
          <>
            {/* Static placeholder */}
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

            {/* Scanlines overlay for that CRT feel */}
            <div className="absolute inset-0 scanlines pointer-events-none" />

            {/* Motion/Alarm indicator */}
            {(hasMotion || hasAlarm) && (
              <div
                className={clsx(
                  'absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded',
                  hasAlarm ? 'bg-crimson/80' : 'bg-amber/80'
                )}
              >
                <AlertTriangle size={12} className="text-white" />
                <span className="text-xs font-bold text-white">
                  {hasAlarm ? 'ALARM' : 'MOTION'}
                </span>
              </div>
            )}

            {/* Live indicator */}
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

        {/* Gradient overlay for text readability */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />
      </div>

      {/* Info bar */}
      <div className="absolute inset-x-0 bottom-0 p-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {/* Status indicator */}
            <span
              className={clsx(
                'flex-shrink-0 w-2 h-2 rounded-full',
                isEnabled ? 'bg-emerald' : 'bg-text-muted'
              )}
            />
            {/* Monitor name */}
            <span className="text-sm font-medium text-white truncate">
              {monitor.name}
            </span>
          </div>

        </div>

        {/* Resolution (shown on hover) */}
        <div
          className={clsx(
            'mt-1 text-[10px] font-mono text-text-muted',
            'opacity-0 group-hover:opacity-100 transition-opacity'
          )}
        >
          {monitor.width}×{monitor.height}
        </div>
      </div>
    </Link>
  );
}
