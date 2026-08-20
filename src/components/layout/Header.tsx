import { Wifi, WifiOff, Cpu, MemoryStick, HardDrive, Gauge } from 'lucide-react';
import { clsx } from 'clsx';
import { useEffect, useState } from 'react';
import { API_BASE } from '@/api/base';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getSystemStatus, getVersion } from '@/api/system';
import { useAuthStore } from '@/stores/auth';
import { SystemRunningToggle } from '@/components/system/SystemRunningToggle';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? undefined;
  const { isAuthenticated } = useAuthStore();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Connectivity check against the API health endpoint
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch(`${API_BASE}/server/health_check`, { method: 'GET' });
        setIsConnected(response.ok);
      } catch {
        setIsConnected(false);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, []);

  // System stats — fed into the right-hand status strip
  const { data: status } = useQuery({
    queryKey: ['systemStatus'],
    queryFn: getSystemStatus,
    enabled: isAuthenticated,
    refetchInterval: 10_000,
  });
  const { data: version } = useQuery({
    queryKey: ['version'],
    queryFn: getVersion,
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

  const stats = status?.stats;
  const memPct = stats && stats.total_mem > 0
    ? Math.round(((stats.total_mem - stats.free_mem) / stats.total_mem) * 100)
    : null;

  return (
    <header className="h-14 bg-surface/80 backdrop-blur-sm border-b border-border-subtle flex items-center justify-between px-6 gap-4">
      {/* Left: Title */}
      <div className="flex items-center gap-4">
        {title && (
          <h1 className="text-lg font-semibold text-text-primary">{title}</h1>
        )}
      </div>

      {/* Center: live system stats strip */}
      {isAuthenticated && stats && (
        <div className="relative hidden lg:block group">
          {/* Compact glanceable strip — same layout as before */}
          <div className="flex items-center gap-4 text-[11px] font-mono tabular-nums text-text-muted px-3 py-1.5 rounded-md border border-transparent group-hover:border-cyan/20 group-hover:bg-surface/40 transition-colors cursor-default">
            {stats.cpu_load != null && (
              <StatItem icon={<Gauge size={11} />} label={t("LOAD")} value={stats.cpu_load.toFixed(2)} />
            )}
            {stats.cpu_usage_percent != null && (
              <StatItem
                icon={<Cpu size={11} />}
                label={t("CPU")}
                value={`${stats.cpu_usage_percent.toFixed(0)}%`}
                tone={stats.cpu_usage_percent > 85 ? 'warn' : 'normal'}
              />
            )}
            {memPct != null && (
              <StatItem
                icon={<MemoryStick size={11} />}
                label={t("MEM")}
                value={`${memPct}%`}
                tone={memPct > 85 ? 'warn' : 'normal'}
              />
            )}
            {stats.disk_usage_percent != null && stats.disk_usage_percent > 0 && (
              <StatItem
                icon={<HardDrive size={11} />}
                label={t("DISK")}
                value={`${stats.disk_usage_percent.toFixed(0)}%`}
                tone={stats.disk_usage_percent > 90 ? 'warn' : 'normal'}
              />
            )}
          </div>

          {/* Hover detail — opens below on hover. Pointer-events:none so
              moving the mouse INTO the tooltip doesn't break the hover. */}
          <div
            role="tooltip"
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50
              w-72 px-4 py-3 rounded-lg border border-cyan/30
              bg-panel/95 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.4)]
              opacity-0 invisible group-hover:opacity-100 group-hover:visible
              transition-all duration-150 pointer-events-none"
          >
            <h4 className="text-[10px] font-mono uppercase tracking-[0.18em] text-cyan mb-2">
              {t('System')}
            </h4>
            <dl className="space-y-1.5 text-[11px] font-mono">
              {stats.cpu_load != null && (
                <DetailRow label={t("Load")} value={stats.cpu_load.toFixed(2)} />
              )}
              {stats.cpu_usage_percent != null && (
                <DetailRow
                  label={t("CPU")}
                  value={`${stats.cpu_usage_percent.toFixed(1)}%`}
                  tone={stats.cpu_usage_percent > 85 ? 'warn' : undefined}
                />
              )}
              {stats.total_mem > 0 && (
                <DetailRow
                  label={t("Memory")}
                  value={`${formatBytes(stats.total_mem - stats.free_mem)} / ${formatBytes(stats.total_mem)}`}
                  tone={memPct != null && memPct > 85 ? 'warn' : undefined}
                />
              )}
              {stats.total_swap > 0 && (
                <DetailRow
                  label={t("Swap")}
                  value={`${formatBytes(stats.total_swap - stats.free_swap)} / ${formatBytes(stats.total_swap)}`}
                />
              )}
              {stats.total_disk > 0 && (
                <DetailRow
                  label={t("Disk")}
                  value={`${formatBytes(stats.used_disk)} / ${formatBytes(stats.total_disk)}`}
                  tone={stats.disk_usage_percent > 90 ? 'warn' : undefined}
                />
              )}
              {version?.version && (
                <DetailRow label={t("Version")} value={`v${version.version}`} />
              )}
            </dl>
          </div>
        </div>
      )}

      {/* Right: connection + running toggle + clock */}
      <div className="flex items-center gap-3">
        {isAuthenticated && <SystemRunningToggle />}

        <div
          className={clsx(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg',
            isConnected ? 'bg-emerald/10' : 'bg-crimson/10'
          )}
        >
          {isConnected ? (
            <>
              <Wifi className="text-emerald" size={14} />
              <span className="text-xs font-medium text-emerald">{t('Connected')}</span>
            </>
          ) : (
            <>
              <WifiOff className="text-crimson" size={14} />
              <span className="text-xs font-medium text-crimson">{t('Disconnected')}</span>
            </>
          )}
        </div>

        <div className="flex flex-col items-end text-end">
          <span className="text-sm font-mono text-text-primary tabular-nums">
            {currentTime.toLocaleTimeString(locale, {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
          <span className="text-[10px] font-mono text-text-muted">
            {version?.version ? `v${version.version} · ` : ''}
            {currentTime.toLocaleDateString(locale, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
      </div>
    </header>
  );
}

function StatItem({
  icon, label, value, tone = 'normal',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'normal' | 'warn';
}) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1',
      tone === 'warn' ? 'text-amber' : 'text-text-secondary',
    )}>
      {icon}
      <span className="text-text-dim">{label}</span>
      <span className="text-text-primary">{value}</span>
    </span>
  );
}

function DetailRow({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone?: 'warn';
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-text-dim uppercase tracking-wider text-[10px]">{label}</dt>
      <dd
        className={clsx(
          'tabular-nums',
          tone === 'warn' ? 'text-amber' : 'text-text-primary',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
