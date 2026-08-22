import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ptz, type PtzCapabilities } from '@/api/ptz';
import { ApiClientError } from '@/api/client';

export type PtzState =
  | { status: 'loading' }
  | { status: 'no-ptz'; message: string }
  | { status: 'ready'; capabilities: PtzCapabilities }
  | { status: 'error'; message: string };

/**
 * Loads a monitor's PTZ capabilities. Returns a discriminated state so the
 * UI can render the controls, an empty "not PTZ-capable" placeholder, or an
 * error — without leaking React Query plumbing.
 *
 * A 400 response with `"Monitor X has no PTZ control configured"` is the
 * intended way the backend signals "this camera isn't PTZ" — surfaced as
 * the dedicated `no-ptz` state.
 */
export function usePtzCapabilities(monitorId: number, enabled = true): PtzState {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['ptz', 'capabilities', monitorId],
    queryFn: () => ptz.getCapabilities(monitorId),
    enabled,
    retry: false,
    staleTime: 60_000,
  });

  if (q.isLoading) return { status: 'loading' };

  if (q.isError) {
    const err = q.error;
    if (err instanceof ApiClientError && err.status === 400) {
      return { status: 'no-ptz', message: err.message };
    }
    return {
      status: 'error',
      message: err instanceof Error ? err.message : t('Failed to load PTZ capabilities'),
    };
  }

  if (q.data) return { status: 'ready', capabilities: q.data };
  return { status: 'loading' };
}
