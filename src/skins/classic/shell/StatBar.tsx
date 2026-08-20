import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getSystemStatus, getVersion } from '@/api/system';
import { useAuthStore } from '@/stores/auth';

/**
 * Classic sub-header stat strip: Load / Cpu / Default storage / Memory /
 * Swap / version, as the legacy navbar's second row. The bandwidth profile
 * chip is deliberately absent (that feature is out of scope); DB connections
 * need a backend field that does not exist yet.
 */
export function ClassicStatBar() {
  const { t } = useTranslation();
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
  const pct = (used: number, total: number) =>
    total > 0 ? Math.round((used / total) * 100) : null;
  const memUsedPct = stats ? pct(stats.total_mem - stats.free_mem, stats.total_mem) : null;
  const swapUsedPct = stats ? pct(stats.total_swap - stats.free_swap, stats.total_swap) : null;

  return (
    <div className="bg-[#2b343d] text-cyan-200 text-xs px-4 py-1 flex items-center gap-5 flex-wrap border-b border-black/30">
      {stats?.cpu_load != null && (
        <span>{t('Load')}: {stats.cpu_load.toFixed(2)}</span>
      )}
      {stats?.cpu_usage_percent != null && (
        <span>{t('Cpu')}: {stats.cpu_usage_percent.toFixed(1)}%</span>
      )}
      {stats?.disk_usage_percent != null && (
        <span>{t('Default')}: {stats.disk_usage_percent.toFixed(0)}%</span>
      )}
      {memUsedPct != null && (
        <span>{t('Memory')}: {memUsedPct}%</span>
      )}
      {swapUsedPct != null && (
        <span>{t('Swap')}: {swapUsedPct}%</span>
      )}
      <span className="ms-auto opacity-75">
        {version?.version ? `v${version.version}` : ''}
      </span>
    </div>
  );
}
