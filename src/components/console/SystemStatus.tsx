import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  RotateCw,
  HardDrive,
  Clock,
} from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { getVersion } from '@/api/system';
import { useAuthStore } from '@/stores/auth';
import type { DaemonStatus } from '@/types';
import type { SystemStats } from '@/api/system';

interface SystemStatusProps {
  daemons?: DaemonStatus[];
  isRunning?: boolean;
  stats?: SystemStats;
  isLoading?: boolean;
}

/**
 * System panel — focuses on what the header strip can't show. The header
 * already carries live LOAD/CPU/MEM/DISK + a RUNNING toggle; this panel
 * adds:
 *
 *  - ZM version + system uptime (derived from the longest-running daemon)
 *  - Per-daemon health with PID, uptime, restart count
 *  - Storage breakdown — overall % from the header, count of configured
 *    areas with a link to the storage admin page for detail
 *
 * No duplicate CPU/Mem/Disk meters. The header has them; here we trade that
 * vertical space for daemons and config detail the operator actually needs
 * to triage a stuck system.
 */
export function SystemStatus({
  daemons = [],
  isRunning,
  stats,
  isLoading,
}: SystemStatusProps) {
  const { isAuthenticated } = useAuthStore();
  const { data: version } = useQuery({
    queryKey: ['version'],
    queryFn: getVersion,
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

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

  // System uptime ≈ longest-running daemon's uptime. ZM doesn't expose a
  // single uptime field, so we approximate from the daemons it does report.
  const systemUptimeSec = daemons
    .map((d) => d.uptime_seconds ?? 0)
    .reduce((max, v) => (v > max ? v : max), 0);

  const runningCount = daemons.filter((d) => d.state === 'running').length;
  const stoppedCount = daemons.filter((d) => d.state === 'stopped').length;

  return (
    <div className="space-y-5">
      {/* Identity strip — running pill + version + uptime in one tight row */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={clsx(
            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono uppercase tracking-wider border',
            isRunning
              ? 'border-emerald/40 bg-emerald/10 text-emerald'
              : 'border-crimson/40 bg-crimson/10 text-crimson',
          )}
        >
          {isRunning ? <CheckCircle size={10} /> : <XCircle size={10} />}
          {isRunning ? 'Running' : 'Stopped'}
        </span>
        <span className="text-[10px] font-mono text-text-muted tabular-nums">
          {version?.version ? `v${version.version}` : '—'}
        </span>
      </div>

      {systemUptimeSec > 0 && (
        <div className="flex items-center gap-2 text-[10px] font-mono text-text-muted">
          <Clock size={10} />
          <span className="uppercase tracking-wider text-text-dim">Uptime</span>
          <span className="text-text-secondary tabular-nums">
            {formatDuration(systemUptimeSec)}
          </span>
        </div>
      )}

      {/* Daemons — the main payload */}
      <section>
        <header className="flex items-baseline justify-between mb-2">
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
            Daemons
          </span>
          <span
            className={clsx(
              'text-[10px] font-mono tabular-nums',
              stoppedCount > 0 ? 'text-amber' : 'text-text-muted',
            )}
          >
            {runningCount}/{daemons.length}
            {stoppedCount > 0 && ` · ${stoppedCount} stopped`}
          </span>
        </header>

        {daemons.length === 0 ? (
          <div className="text-[11px] text-text-muted italic py-2 text-center">
            No daemons reported.
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle/60">
            {daemons.map((d) => (
              <DaemonRow key={d.id ?? d.name} daemon={d} />
            ))}
          </ul>
        )}
      </section>

      {/* Storage areas — header has overall % but not the breakdown */}
      {stats && (
        <section>
          <header className="flex items-baseline justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
              Storage
            </span>
            <Link
              to="/settings/storage"
              className="text-[10px] font-mono text-cyan/80 hover:text-cyan transition-colors"
            >
              manage →
            </Link>
          </header>
          <div className="flex items-center gap-2 text-[11px]">
            <HardDrive size={11} className="text-text-muted" />
            <span className="text-text-secondary font-mono tabular-nums">
              {formatBytes(stats.used_disk)} / {formatBytes(stats.total_disk)}
            </span>
            <span className="ml-auto text-text-muted font-mono">
              {stats.disk_usage_percent != null
                ? `${stats.disk_usage_percent.toFixed(0)}% used`
                : ''}
            </span>
          </div>
        </section>
      )}
    </div>
  );
}

function DaemonRow({ daemon }: { daemon: DaemonStatus }) {
  const StatusIcon =
    daemon.state === 'running'
      ? CheckCircle
      : daemon.state === 'stopped'
        ? XCircle
        : AlertCircle;

  const statusColor =
    daemon.state === 'running'
      ? 'text-emerald'
      : daemon.state === 'stopped'
        ? 'text-crimson'
        : 'text-amber';

  return (
    <li className="flex items-center gap-2 py-1.5 text-[11px]">
      <StatusIcon size={11} className={statusColor} />
      <span className="font-mono text-text-secondary truncate flex-1" title={daemon.id ?? daemon.name}>
        {daemon.name}
      </span>
      {daemon.pid != null && (
        <span className="font-mono text-text-dim tabular-nums" title="PID">
          {daemon.pid}
        </span>
      )}
      {daemon.restart_count != null && daemon.restart_count > 0 && (
        <span
          className="inline-flex items-center gap-0.5 text-amber font-mono tabular-nums"
          title={`Restarted ${daemon.restart_count}× since boot`}
        >
          <RotateCw size={9} />
          {daemon.restart_count}
        </span>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------------ */
/*  Helpers                                                                  */
/* ------------------------------------------------------------------------ */

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

