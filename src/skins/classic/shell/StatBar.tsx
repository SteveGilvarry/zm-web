import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { getSystemStatus, getVersion } from '@/api/system';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { usePerms } from '@/features/auth/usePerms';
import { useZmConfig, useZmConfigTable } from '@/features/config/useZmConfig';
import { humanFilesize } from '@/lib/format';
import { consoleRefreshInterval } from '@/features/console/refreshInterval';
import {
  DB_THRESHOLDS, RAM_THRESHOLDS, STAT_TONE_CLASS, STORAGE_THRESHOLDS, statTone,
} from './statTone';
import { versionState } from './versionState';

/**
 * Classic sub-header stat strip (legacy navbar-two): Load / Cpu / DB /
 * storage / Memory / Swap / version, each with the tooltip and colour
 * `skins/classic/includes/functions.php` gives it. Every entry needs
 * `canView('System')`; `ZM_WEB_SHOW_SERVER_STATS` off drops the server
 * stats but keeps the version (`buildStatisticsBar`). Polls every
 * `ZM_WEB_H_REFRESH_NAVBAR` seconds (legacy `navBarRefresh`).
 *
 * The bandwidth-profile chip is deliberately absent (out of scope). Storage
 * is one global figure, not one entry per area: `/api/v3/storage` reports the
 * configured `disk_space` only, so per-area used/total — and legacy's
 * "X used by events" half of the tooltip — has no backend data yet.
 */
export function ClassicStatBar() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const { can } = usePerms();
  const canViewSystem = can('system', 'View');
  const showStats = useZmConfig('ZM_WEB_SHOW_SERVER_STATS', true);
  // The navbar's flip chevron (legacy cookie `zmHeaderFlip`).
  const flippedOpen = useUiStore((s) => s.classicStatBarOpen);
  const enabled = isAuthenticated && canViewSystem;
  const { data: configs } = useZmConfigTable();
  // The bandwidth switcher is out of scope, so the high-bandwidth row
  // stands in for all three, as for the console's own refresh.
  const navbarRefresh = consoleRefreshInterval(configs?.ZM_WEB_H_REFRESH_NAVBAR, 10_000);

  const { data: status } = useQuery({
    queryKey: ['systemStatus'],
    queryFn: getSystemStatus,
    enabled: enabled && showStats,
    refetchInterval: navbarRefresh,
  });
  const { data: version } = useQuery({
    queryKey: ['version'],
    queryFn: getVersion,
    enabled,
    refetchInterval: 60_000,
  });

  if (!enabled || !flippedOpen) return null;

  const stats = showStats ? status?.stats : undefined;
  const pct = (used: number, total: number) =>
    total > 0 ? Math.round((used / total) * 100) : null;
  // Legacy reads /proc/meminfo and subtracts Buffers and Cached as well;
  // `/system/status` reports free memory only, so this reads a few points
  // higher than the legacy header on the same box.
  const memUsed = stats ? stats.total_mem - stats.free_mem : 0;
  const memUsedPct = stats ? pct(memUsed, stats.total_mem) : null;
  const swapUsed = stats ? stats.total_swap - stats.free_swap : 0;
  const swapUsedPct = stats ? pct(swapUsed, stats.total_swap) : null;

  const dbCount = stats?.db_connections;
  const dbMax = stats?.db_max_connections;
  const dbPct = dbCount != null && dbMax ? (100 * dbCount) / dbMax : null;

  const ver = versionState({
    version: version?.version,
    dbVersion: configs?.ZM_DYN_DB_VERSION,
    lastVersion: configs?.ZM_DYN_LAST_VERSION,
    checkForUpdates: configs?.ZM_CHECK_FOR_UPDATES === '1',
    nextReminder: Number(configs?.ZM_DYN_NEXT_REMINDER ?? 0) || 0,
  });

  const versionTitle = ver.status === 'db-upgrade'
    ? t('Please run zmupdate.pl to update')
    : ver.status === 'update-available'
      ? t('An update to ZoneMinder is available.')
      : t('No update is necessary.');

  return (
    <div
      id="classic-stat-bar"
      className="bg-classic-nav-deep text-classic-nav-link text-label px-4 py-1 flex items-center gap-5 flex-wrap border-b border-black/30"
      data-testid="classic-stat-bar"
    >
      {stats?.cpu_load != null && (
        <span>{t('Load')}: {stats.cpu_load.toFixed(2)}</span>
      )}
      {stats?.cpu_usage_percent != null && (
        <span>{t('Cpu')}: {stats.cpu_usage_percent.toFixed(1)}%</span>
      )}
      {dbCount != null && dbMax != null && (
        <span className={STAT_TONE_CLASS[statTone(dbPct, DB_THRESHOLDS)]} data-testid="stat-db">
          {t('DB')}: {dbCount}/{dbMax}
        </span>
      )}
      {stats?.disk_usage_percent != null && (
        // Legacy links each storage entry to Options → Storage.
        <Link
          to="/settings/storage"
          className={clsx('hover:underline', STAT_TONE_CLASS[statTone(stats.disk_usage_percent, STORAGE_THRESHOLDS)])}
          title={t('{{used}} of {{total}}', {
            used: humanFilesize(stats.used_disk),
            total: humanFilesize(stats.total_disk),
          })}
          data-testid="stat-storage"
        >
          {t('Default')}: {stats.disk_usage_percent.toFixed(0)}%
        </Link>
      )}
      {memUsedPct != null && (
        <span
          className={STAT_TONE_CLASS[statTone(memUsedPct, RAM_THRESHOLDS)]}
          title={t('{{used}} of {{total}}', {
            used: humanFilesize(memUsed),
            total: humanFilesize(stats!.total_mem),
          })}
          data-testid="stat-memory"
        >
          {t('Memory')}: {memUsedPct}%
        </span>
      )}
      {swapUsedPct != null && (
        <span
          className={STAT_TONE_CLASS[statTone(swapUsedPct, RAM_THRESHOLDS)]}
          title={t('{{used}} of {{total}}', {
            used: humanFilesize(swapUsed),
            total: humanFilesize(stats!.total_swap),
          })}
          data-testid="stat-swap"
        >
          {t('Swap')}: {swapUsedPct}%
        </span>
      )}
      <span
        className={clsx('ms-auto opacity-80', STAT_TONE_CLASS[ver.tone])}
        title={versionTitle}
        data-testid="stat-version"
      >
        {version?.version ? `v${version.version}` : ''}
      </span>
    </div>
  );
}
