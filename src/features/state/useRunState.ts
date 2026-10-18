import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getSystemStatus } from '@/api/system';
import { listStates, type State } from '@/api/states';
import { useAuthStore } from '@/stores/auth';

/**
 * Legacy `runtimeStatus()` (skins/classic/includes/functions.php): while
 * running, the name of the active saved state, unless it is `default`;
 * otherwise "Running" or "Stopped". `null` while the status is unknown.
 */
export function runStateName(
  running: boolean | null,
  states: Pick<State, 'name' | 'is_active'>[] | undefined,
): string | null {
  if (running === null || !running) return null;
  const active = states?.find((s) => s.is_active === 1)?.name ?? '';
  return active && active !== 'default' ? active : null;
}

export interface RunState {
  /** `null` until `/system/status` answers. */
  running: boolean | null;
  /** What the navbar status button reads. */
  label: string;
  busy: boolean;
}

/** The navbar status button's text, shared by both skins. */
export function useRunState(): RunState {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const statusQ = useQuery({
    queryKey: ['systemStatus'],
    queryFn: getSystemStatus,
    enabled: isAuthenticated,
    refetchInterval: 10_000,
  });
  // Same key and shape as the run-state chooser, which invalidates it on Apply.
  const statesQ = useQuery({
    queryKey: ['states'],
    queryFn: () => listStates({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });
  const running = statusQ.data?.running ?? null;
  const named = runStateName(running, statesQ.data?.items);
  const label = running === null ? '…' : named ?? (running ? t('Running') : t('Stopped'));
  return { running, label, busy: statusQ.isLoading };
}
