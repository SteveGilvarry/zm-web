import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  RotateCw,
  HardDrive,
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
 * System detail — what the console's status line does not have room for.
 *
 * It used to sit in a panel beside the cameras and deliberately left the
 * machine readings to the header strip. Both of those are gone: this now
 * opens from the status line's running indicator, and it is the one place
 * in the app that carries the full picture — version and uptime, the
 * machine's load, memory and disk, per-daemon health with PID and restart
 * count, and a way through to the storage admin.
 *
 * Laid out in columns because a disclosure is wide and short, not narrow
 * and tall.
 */
export function SystemStatus({
  daemons = [],
  isRunning,
  stats,
  isLoading,
}: SystemStatusProps) {
  const { t } = useTranslation();
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
        <div className="h-4 w-20 bg-surface-2 rounded" />
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-3 bg-surface-2 rounded" />
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

  const memPct =
    stats && stats.total_mem > 0
      ? Math.round(((stats.total_mem - stats.free_mem) / stats.total_mem) * 100)
      : null;

  return (
    <div className="grid gap-6 sm:grid-cols-3">
      {/* Identity + machine */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={clsx('w-2 h-2 rounded-full', isRunning ? 'bg-ok' : 'bg-danger')}
          />
          <span className={clsx('text-sm', isRunning ? 'text-fg' : 'text-danger')}>
            {isRunning ? t('Running') : t('Stopped')}
          </span>
          <span className="ms-auto text-xs font-mono tabular-nums text-fg-dim">
            {version?.version ? `v${version.version}` : '—'}
          </span>
        </div>

        <dl className="space-y-1 text-xs">
          {systemUptimeSec > 0 && (
            <Reading label={t('Uptime')} value={formatDuration(systemUptimeSec, t)} />
          )}
          {stats?.cpu_load != null && (
            <Reading label={t('Load')} value={stats.cpu_load.toFixed(2)} />
          )}
          {stats?.cpu_usage_percent != null && (
            <Reading
              label={t('CPU')}
              value={`${stats.cpu_usage_percent.toFixed(1)}%`}
              warn={stats.cpu_usage_percent > 85}
            />
          )}
          {stats && stats.total_mem > 0 && (
            <Reading
              label={t('Memory')}
              value={`${formatBytes(stats.total_mem - stats.free_mem)} / ${formatBytes(stats.total_mem)}`}
              warn={memPct != null && memPct > 85}
            />
          )}
          {stats && stats.total_swap > 0 && (
            <Reading
              label={t('Swap')}
              value={`${formatBytes(stats.total_swap - stats.free_swap)} / ${formatBytes(stats.total_swap)}`}
            />
          )}
        </dl>
      </section>

      {/* Daemons — the main payload */}
      <section>
        <header className="flex items-baseline justify-between mb-1.5">
          <h4 className="text-xs text-fg-dim">{t('Daemons')}</h4>
          <span
            className={clsx(
              'text-xs font-mono tabular-nums',
              stoppedCount > 0 ? 'text-warn' : 'text-fg-dim',
            )}
          >
            {runningCount}/{daemons.length}
            {stoppedCount > 0 && ` · ${t('{{count}} stopped', { count: stoppedCount })}`}
          </span>
        </header>

        {daemons.length === 0 ? (
          <p className="text-xs text-fg-faint py-2">{t('No daemons reported.')}</p>
        ) : (
          <ul className="divide-y divide-border-subtle max-h-48 overflow-auto">
            {daemons.map((d) => (
              <DaemonRow key={d.id ?? d.name} daemon={d} />
            ))}
          </ul>
        )}
      </section>

      {/* Storage */}
      {stats && (
        <section>
          <header className="flex items-baseline justify-between mb-1.5">
            <h4 className="text-xs text-fg-dim">{t('Storage')}</h4>
            <Link
              to="/settings/storage"
              className="text-xs text-accent hover:underline"
            >
              {t('manage →')}
            </Link>
          </header>
          <div className="flex items-center gap-2 text-xs">
            <HardDrive size={12} className="text-fg-dim" aria-hidden />
            <span className="font-mono tabular-nums text-fg-muted">
              {formatBytes(stats.used_disk)} / {formatBytes(stats.total_disk)}
            </span>
            <span
              className={clsx(
                'ms-auto font-mono tabular-nums',
                stats.disk_usage_percent > 90
                  ? 'text-danger'
                  : stats.disk_usage_percent > 75
                    ? 'text-warn'
                    : 'text-fg-dim',
              )}
            >
              {stats.disk_usage_percent != null
                ? t('{{percent}}% used', { percent: stats.disk_usage_percent.toFixed(0) })
                : ''}
            </span>
          </div>
        </section>
      )}
    </div>
  );
}

/** One label/value line. Colour only when a threshold has been crossed. */
function Reading({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-fg-dim">{label}</dt>
      <dd className={clsx('font-mono tabular-nums', warn ? 'text-warn' : 'text-fg')}>
        {value}
      </dd>
    </div>
  );
}

function DaemonRow({ daemon }: { daemon: DaemonStatus }) {
  const { t } = useTranslation();
  const StatusIcon =
    daemon.state === 'running'
      ? CheckCircle
      : daemon.state === 'stopped'
        ? XCircle
        : AlertCircle;

  const statusColor =
    daemon.state === 'running'
      ? 'text-ok'
      : daemon.state === 'stopped'
        ? 'text-danger'
        : 'text-warn';

  return (
    <li className="flex items-center gap-2 py-1 text-xs">
      <StatusIcon size={12} className={statusColor} aria-hidden />
      <span className="font-mono text-fg-muted truncate flex-1" title={daemon.id ?? daemon.name}>
        {daemon.name}
      </span>
      {daemon.pid != null && (
        <span className="font-mono text-fg-faint tabular-nums" title={t('PID')}>
          {daemon.pid}
        </span>
      )}
      {daemon.restart_count != null && daemon.restart_count > 0 && (
        <span
          className="inline-flex items-center gap-0.5 text-warn font-mono tabular-nums"
          title={t('Restarted {{count}}× since boot', { count: daemon.restart_count })}
        >
          <RotateCw size={10} aria-hidden />
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

/** Compact uptime. The unit letters are translated; the numbers are not. */
function formatDuration(sec: number, t: TFunction): string {
  if (sec < 60) return t('{{s}}s', { s: sec });
  const m = Math.floor(sec / 60);
  if (m < 60) return t('{{m}}m', { m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('{{h}}h {{m}}m', { h, m: m % 60 });
  const d = Math.floor(h / 24);
  return t('{{d}}d {{h}}h', { d, h: h % 24 });
}
