import { Wifi, WifiOff, Cpu, MemoryStick, HardDrive, Gauge } from 'lucide-react';
import { clsx } from 'clsx';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSystemStatus, getVersion } from '@/api/system';
import { useAuthStore } from '@/stores/auth';
import { SystemRunningToggle } from '@/components/system/SystemRunningToggle';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
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
        const response = await fetch('/api/v3/server/health_check', { method: 'GET' });
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
      {isAuthenticated && (
        <div className="hidden lg:flex items-center gap-4 text-[11px] font-mono tabular-nums text-text-muted">
          {stats?.cpu_load != null && (
            <StatItem icon={<Gauge size={11} />} label="LOAD" value={stats.cpu_load.toFixed(2)} />
          )}
          {stats?.cpu_usage_percent != null && (
            <StatItem
              icon={<Cpu size={11} />}
              label="CPU"
              value={`${stats.cpu_usage_percent.toFixed(0)}%`}
              tone={stats.cpu_usage_percent > 85 ? 'warn' : 'normal'}
            />
          )}
          {memPct != null && (
            <StatItem
              icon={<MemoryStick size={11} />}
              label="MEM"
              value={`${memPct}%`}
              tone={memPct > 85 ? 'warn' : 'normal'}
            />
          )}
          {stats?.disk_usage_percent != null && stats.disk_usage_percent > 0 && (
            <StatItem
              icon={<HardDrive size={11} />}
              label="DISK"
              value={`${stats.disk_usage_percent.toFixed(0)}%`}
              tone={stats.disk_usage_percent > 90 ? 'warn' : 'normal'}
            />
          )}
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
              <span className="text-xs font-medium text-emerald">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="text-crimson" size={14} />
              <span className="text-xs font-medium text-crimson">Disconnected</span>
            </>
          )}
        </div>

        <div className="flex flex-col items-end">
          <span className="text-sm font-mono text-text-primary tabular-nums">
            {currentTime.toLocaleTimeString('en-US', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
          <span className="text-[10px] font-mono text-text-muted">
            {version?.version ? `v${version.version} · ` : ''}
            {currentTime.toLocaleDateString('en-US', {
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
