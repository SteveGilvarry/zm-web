import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Power, Loader2 } from 'lucide-react';
import { getSystemStatus, systemStartup, systemShutdown } from '@/api/system';
import { useAuthStore } from '@/stores/auth';

interface SystemRunningToggleProps {
  /** 'compact' (default) for header strips, 'banner' for full-row buttons. */
  variant?: 'compact' | 'banner';
  /** Override the visual theme — classic skin needs lighter tones. */
  tone?: 'dark' | 'light';
}

/**
 * Interactive RUNNING / STOPPED toggle that hits /api/v3/system/startup or
 * /api/v3/system/shutdown and refreshes the cached status. Stops always
 * confirm first — bringing down the recording stack is the most disruptive
 * action an operator can take from the dashboard.
 */
export function SystemRunningToggle({
  variant = 'compact',
  tone = 'dark',
}: SystemRunningToggleProps) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();

  const statusQ = useQuery({
    queryKey: ['systemStatus'],
    queryFn: getSystemStatus,
    enabled: isAuthenticated,
    refetchInterval: 10_000,
  });

  const running = statusQ.data?.running ?? null;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['systemStatus'] });

  const startMutation = useMutation({ mutationFn: systemStartup, onSuccess: invalidate });
  const stopMutation = useMutation({ mutationFn: systemShutdown, onSuccess: invalidate });

  const busy = startMutation.isPending || stopMutation.isPending || statusQ.isLoading;

  const handleClick = () => {
    if (busy) return;
    if (running) {
      if (confirm(t('Stop ZoneMinder? Recording will halt across every monitor.'))) {
        stopMutation.mutate();
      }
    } else {
      startMutation.mutate();
    }
  };

  const label = running === null ? '…' : running ? t('Running') : t('Stopped');

  if (variant === 'banner') {
    return (
      <button
        onClick={handleClick}
        disabled={busy}
        className={clsx(
          'flex items-center gap-2 px-3 py-1.5 rounded-md font-mono text-xs uppercase tracking-wider border-2 transition-all',
          running
            ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
            : 'border-crimson/50 bg-crimson/10 text-crimson hover:bg-crimson/20',
          busy && 'opacity-70 cursor-wait',
        )}
        aria-label={running ? t('Stop ZoneMinder') : t('Start ZoneMinder')}
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
        {label}
      </button>
    );
  }

  // compact — tone-aware so classic and modern skins each look at home
  const baseCls = tone === 'light'
    ? running
      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
      : 'bg-red-600 hover:bg-red-500 text-white'
    : running
      ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
      : 'border border-crimson/40 bg-crimson/15 text-crimson hover:bg-crimson/25';

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className={clsx(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded font-mono text-[11px] uppercase tracking-wider transition-all',
        baseCls,
        busy && 'opacity-70 cursor-wait',
      )}
      aria-label={running ? t('Stop ZoneMinder') : t('Start ZoneMinder')}
    >
      {busy
        ? <Loader2 size={11} className="animate-spin" />
        : <Power size={11} />}
      {label}
    </button>
  );
}
