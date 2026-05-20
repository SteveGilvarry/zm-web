import { useQuery } from '@tanstack/react-query';
import { getSystemStatus, getVersion } from '@/api/system';
import { useAuthStore } from '@/stores/auth';

// Stub stat strip that mirrors the legacy ZM sub-header. Phase 9 builds the
// fully wired version (bandwidth profile, Running toggle, etc.).
export function ClassicStatBar() {
  const { isAuthenticated } = useAuthStore();
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
  const memUsedPct =
    stats && stats.total_mem > 0
      ? Math.round(((stats.total_mem - stats.free_mem) / stats.total_mem) * 100)
      : null;

  return (
    <div className="bg-[#2b343d] text-cyan-200 text-xs px-4 py-1 flex items-center gap-5 flex-wrap border-b border-black/30">
      <span className="flex items-center gap-1">
        <span aria-hidden>📶</span>
        <span>High</span>
      </span>
      {stats?.cpu_load != null && (
        <span>Load: {stats.cpu_load.toFixed(2)}</span>
      )}
      {stats?.cpu_usage_percent != null && stats.cpu_usage_percent > 0 && (
        <span>Cpu: {stats.cpu_usage_percent.toFixed(1)}%</span>
      )}
      {stats?.disk_usage_percent != null && stats.disk_usage_percent > 0 && (
        <span>Default: {stats.disk_usage_percent.toFixed(0)}%</span>
      )}
      {memUsedPct != null && (
        <span>Memory: {memUsedPct}%</span>
      )}
      <span className="ml-auto opacity-75">
        {version?.version ? `v${version.version}` : ''}
      </span>
    </div>
  );
}
