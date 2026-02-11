import { clsx } from 'clsx';
import {
  Cpu,
  HardDrive,
  Activity,
  Server,
  CheckCircle,
  XCircle,
  AlertCircle,
  MemoryStick,
} from 'lucide-react';
import type { DaemonStatus } from '@/types';
import type { SystemStats } from '@/api/system';

interface SystemStatusProps {
  daemons?: DaemonStatus[];
  isRunning?: boolean;
  stats?: SystemStats;
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function SystemStatus({
  daemons = [],
  isRunning,
  stats,
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

  const memoryUsedPercent = stats && stats.total_mem > 0
    ? ((stats.total_mem - stats.free_mem) / stats.total_mem) * 100
    : 0;

  return (
    <div className="space-y-4">
      {/* ZoneMinder Status */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Server size={14} className="text-cyan" />
          <span className="text-xs font-medium text-text-secondary">ZoneMinder</span>
        </div>
        <div className="flex items-center justify-center py-2">
          {isRunning !== undefined ? (
            <div className={clsx(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg',
              isRunning ? 'bg-emerald/20 text-emerald' : 'bg-crimson/20 text-crimson'
            )}>
              {isRunning ? <CheckCircle size={14} /> : <XCircle size={14} />}
              <span className="text-sm font-medium">{isRunning ? 'Running' : 'Stopped'}</span>
            </div>
          ) : (
            <div className="text-xs text-text-muted text-center py-2">
              No data
            </div>
          )}
        </div>
      </div>

      {/* CPU Usage */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Cpu size={14} className="text-amber" />
            <span className="text-xs font-medium text-text-secondary">CPU</span>
          </div>
          {stats && stats.cpu_usage_percent > 0 && (
            <span className={clsx(
              'text-xs font-mono',
              stats.cpu_usage_percent > 90 ? 'text-crimson' :
              stats.cpu_usage_percent > 70 ? 'text-amber' : 'text-text-secondary'
            )}>
              {stats.cpu_usage_percent.toFixed(1)}%
            </span>
          )}
        </div>
        {stats && stats.cpu_usage_percent > 0 ? (
          <LoadBar value={stats.cpu_usage_percent} />
        ) : (
          <div className="text-xs text-text-muted text-center py-1">No data</div>
        )}
        {stats && stats.cpu_load > 0 && (
          <div className="text-[10px] text-text-muted mt-1">
            Load: {stats.cpu_load.toFixed(2)}
          </div>
        )}
      </div>

      {/* Memory Usage */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <MemoryStick size={14} className="text-purple" />
            <span className="text-xs font-medium text-text-secondary">Memory</span>
          </div>
          {stats && stats.total_mem > 0 && (
            <span className={clsx(
              'text-xs font-mono',
              memoryUsedPercent > 90 ? 'text-crimson' :
              memoryUsedPercent > 70 ? 'text-amber' : 'text-text-secondary'
            )}>
              {memoryUsedPercent.toFixed(1)}%
            </span>
          )}
        </div>
        {stats && stats.total_mem > 0 ? (
          <>
            <LoadBar value={memoryUsedPercent} />
            <div className="text-[10px] text-text-muted mt-1">
              {formatBytes(stats.total_mem - stats.free_mem)} / {formatBytes(stats.total_mem)}
            </div>
          </>
        ) : (
          <div className="text-xs text-text-muted text-center py-1">No data</div>
        )}
      </div>

      {/* Disk Usage */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <HardDrive size={14} className="text-emerald" />
            <span className="text-xs font-medium text-text-secondary">Storage</span>
          </div>
          {stats && stats.disk_usage_percent > 0 && (
            <span className={clsx(
              'text-xs font-mono',
              stats.disk_usage_percent > 90 ? 'text-crimson' :
              stats.disk_usage_percent > 70 ? 'text-amber' : 'text-text-secondary'
            )}>
              {stats.disk_usage_percent.toFixed(1)}%
            </span>
          )}
        </div>
        {stats && stats.total_disk > 0 ? (
          <>
            <LoadBar value={stats.disk_usage_percent} />
            <div className="text-[10px] text-text-muted mt-1">
              {formatBytes(stats.used_disk)} / {formatBytes(stats.total_disk)}
            </div>
          </>
        ) : (
          <div className="text-xs text-text-muted text-center py-1">No data</div>
        )}
      </div>

      {/* Daemons */}
      {daemons.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Activity size={14} className="text-cyan" />
            <span className="text-xs font-medium text-text-secondary">Daemons</span>
            <span className="ml-auto text-[10px] text-text-dim">
              {daemons.filter((d) => d.status === 'running').length}/{daemons.length}
            </span>
          </div>
          <div className="divide-y divide-border-subtle">
            {daemons.slice(0, 6).map((daemon) => (
              <DaemonItem key={daemon.name} daemon={daemon} />
            ))}
          </div>
        </div>
      )}

      {/* System Activity */}
      <div className="pt-2 border-t border-border-subtle">
        <div className={clsx(
          'flex items-center justify-center gap-2',
          isRunning ? 'text-emerald' : 'text-amber'
        )}>
          <Activity size={14} className={isRunning ? 'animate-pulse' : ''} />
          <span className="text-xs font-mono">
            {isRunning ? 'SYSTEM OPERATIONAL' : 'SYSTEM OFFLINE'}
          </span>
        </div>
      </div>
    </div>
  );
}
