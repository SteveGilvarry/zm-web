import { clsx } from 'clsx';
import { Video, VideoOff, AlertTriangle, Circle } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import type { Monitor, MonitorFunction } from '@/types';

interface MonitorThumbnailProps {
  monitor: Monitor;
  isStreaming?: boolean;
  hasMotion?: boolean;
  hasAlarm?: boolean;
}

const functionColors: Record<MonitorFunction, string> = {
  None: 'text-text-muted',
  Monitor: 'text-cyan',
  Modect: 'text-amber',
  Record: 'text-crimson',
  Mocord: 'text-purple',
  Nodect: 'text-text-secondary',
};

const functionLabels: Record<MonitorFunction, string> = {
  None: 'OFF',
  Monitor: 'MON',
  Modect: 'MOD',
  Record: 'REC',
  Mocord: 'MRC',
  Nodect: 'NOD',
};

export function MonitorThumbnail({
  monitor,
  isStreaming = false,
  hasMotion = false,
  hasAlarm = false,
}: MonitorThumbnailProps) {
  const isEnabled = monitor.enabled && monitor.function !== 'None';

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
        {isEnabled ? (
          <>
            {/* Placeholder for actual video - in real implementation, this would be a snapshot or HLS player */}
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

          {/* Function badge */}
          <span
            className={clsx(
              'text-[10px] font-mono font-bold px-1.5 py-0.5 rounded',
              'bg-black/40',
              functionColors[monitor.function]
            )}
          >
            {functionLabels[monitor.function]}
          </span>
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
