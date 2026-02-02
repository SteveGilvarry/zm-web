import { clsx } from 'clsx';
import {
  Cpu,
  HardDrive,
  Activity,
  Server,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import type { DaemonStatus } from '@/types';

interface SystemStatusProps {
  daemons?: DaemonStatus[];
  cpuLoad?: number[];
  diskUsage?: { path: string; percent: number }[];
  isLoading?: boolean;
}

function LoadBar({ value, max = 100 }: { value: number; max?: number }) {
  const percent = Math.min((value / max) * 100, 100);
  const color =
    percent > 90
      ? 'bg-crimson'
      : percent > 70
        ? 'bg-amber'
        : 'bg-cyan';

  return (
    <div className="h-1.5 rounded-full bg-border overflow-hidden">
      <div
        className={clsx('h-full rounded-full transition-all duration-slow', color)}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function DaemonItem({ daemon }: { daemon: DaemonStatus }) {
  const StatusIcon =
    daemon.status === 'running'
      ? CheckCircle
      : daemon.status === 'stopped'
        ? XCircle
        : AlertCircle;

  const statusColor =
    daemon.status === 'running'
      ? 'text-emerald'
      : daemon.status === 'stopped'
        ? 'text-crimson'
        : 'text-amber';

  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <StatusIcon size={12} className={statusColor} />
        <span className="text-xs font-mono text-text-secondary">{daemon.name}</span>
      </div>
      <span className={clsx('text-[10px] font-mono uppercase', statusColor)}>
        {daemon.status}
      </span>
    </div>
  );
}

export function SystemStatus({
  daemons = [],
  cpuLoad = [],
  diskUsage = [],
  isLoading,
}: SystemStatusProps) {
  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-4 w-20 bg-border/30 rounded" />
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-3 bg-border/30 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* CPU Load */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Cpu size={14} className="text-cyan" />
          <span className="text-xs font-medium text-text-secondary">CPU Load</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {cpuLoad.length > 0 ? (
            cpuLoad.slice(0, 3).map((load, i) => (
              <div key={i} className="text-center">
                <div className="text-lg font-mono font-bold text-text-primary">
                  {load.toFixed(1)}
                </div>
                <div className="text-[10px] text-text-muted">
                  {i === 0 ? '1m' : i === 1 ? '5m' : '15m'}
                </div>
                <LoadBar value={load} max={4} />
              </div>
            ))
          ) : (
            <div className="col-span-3 text-xs text-text-muted text-center py-2">
              No data
            </div>
          )}
        </div>
      </div>

      {/* Disk Usage */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <HardDrive size={14} className="text-amber" />
          <span className="text-xs font-medium text-text-secondary">Storage</span>
        </div>
        <div className="space-y-2">
          {diskUsage.length > 0 ? (
            diskUsage.slice(0, 3).map((disk, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-text-muted truncate max-w-[120px]">
                    {disk.path}
                  </span>
                  <span
                    className={clsx(
                      'text-xs font-mono',
                      disk.percent > 90
                        ? 'text-crimson'
                        : disk.percent > 70
                          ? 'text-amber'
                          : 'text-text-secondary'
                    )}
                  >
                    {disk.percent}%
                  </span>
                </div>
                <LoadBar value={disk.percent} />
              </div>
            ))
          ) : (
            <div className="text-xs text-text-muted text-center py-2">No data</div>
          )}
        </div>
      </div>

      {/* Daemons */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Server size={14} className="text-emerald" />
          <span className="text-xs font-medium text-text-secondary">Daemons</span>
          <span className="ml-auto text-[10px] text-text-dim">
            {daemons.filter((d) => d.status === 'running').length}/{daemons.length}
          </span>
        </div>
        <div className="divide-y divide-border-subtle">
          {daemons.length > 0 ? (
            daemons.slice(0, 6).map((daemon) => (
              <DaemonItem key={daemon.name} daemon={daemon} />
            ))
          ) : (
            <div className="text-xs text-text-muted text-center py-2">No data</div>
          )}
        </div>
      </div>

      {/* System Activity */}
      <div className="pt-2 border-t border-border-subtle">
        <div className="flex items-center justify-center gap-2 text-emerald">
          <Activity size={14} className="animate-pulse" />
          <span className="text-xs font-mono">SYSTEM OPERATIONAL</span>
        </div>
      </div>
    </div>
  );
}
