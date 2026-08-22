import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Power, Loader2 } from 'lucide-react';
import { getSystemStatus } from '@/api/system';
import { useAuthStore } from '@/stores/auth';
import { RunStateChooser } from '@/features/state/RunStateChooser';

interface SystemRunningToggleProps {
  /** 'compact' (default) for header strips, 'banner' for full-row buttons. */
  variant?: 'compact' | 'banner';
  /** Override the visual theme — classic skin needs lighter tones. */
  tone?: 'dark' | 'light';
}

/**
 * RUNNING / STOPPED badge in the header. Clicking it opens the run-state
 * chooser (Start / Stop / Restart / saved states), as the legacy badge
 * opened `?view=state`; every action confirms before it runs.
 */
export function SystemRunningToggle({
  variant = 'compact',
  tone = 'dark',
}: SystemRunningToggleProps) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const [chooserOpen, setChooserOpen] = useState(false);

  const statusQ = useQuery({
    queryKey: ['systemStatus'],
    queryFn: getSystemStatus,
    enabled: isAuthenticated,
    refetchInterval: 10_000,
  });

  const running = statusQ.data?.running ?? null;
  const busy = statusQ.isLoading;
  const label = running === null ? '…' : running ? t('Running') : t('Stopped');
  const ariaLabel = t('Run state: {{state}}. Change run state', { state: label });

  const chooser = (
    <RunStateChooser isOpen={chooserOpen} onClose={() => setChooserOpen(false)} running={running} />
  );

  if (variant === 'banner') {
    return (
      <>
        <button
          onClick={() => setChooserOpen(true)}
          disabled={busy}
          className={clsx(
            'flex items-center gap-2 px-3 py-1.5 rounded text-sm border transition-colors',
            running
              ? 'border-ok/40 bg-ok/10 text-ok hover:bg-ok/20'
              : 'border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
            busy && 'opacity-70 cursor-wait',
          )}
          aria-label={ariaLabel}
          aria-haspopup="dialog"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
          {label}
        </button>
        {chooser}
      </>
    );
  }

  // compact — tone-aware so classic and modern skins each look at home
  const baseCls = tone === 'light'
    ? running
      ? 'bg-ok hover:bg-ok-dim text-ok-fg'
      : 'bg-danger hover:bg-danger-dim text-danger-fg'
    : running
      ? 'border border-ok/40 bg-ok/15 text-ok hover:bg-ok/25'
      : 'border border-danger/40 bg-danger/15 text-danger hover:bg-danger/25';

  return (
    <>
      <button
        onClick={() => setChooserOpen(true)}
        disabled={busy}
        className={clsx(
          'inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
          baseCls,
          busy && 'opacity-70 cursor-wait',
        )}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
      >
        {busy
          ? <Loader2 size={11} className="animate-spin" />
          : <Power size={11} />}
        {label}
      </button>
      {chooser}
    </>
  );
}
