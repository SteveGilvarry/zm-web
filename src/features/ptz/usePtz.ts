import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ptz, type PtzCapabilities } from '@/api/ptz';
import { ApiClientError } from '@/api/client';
import { useZmConfig } from '@/features/config/useZmConfig';

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
 *
 * `ZM_OPT_CONTROL` is ZoneMinder's master switch for camera control; with it
 * off, legacy hides every PTZ affordance. Gating here rather than in each
 * page means one switch covers both skins and no capability request is made
 * for a feature the installation has turned off.
 */
export function usePtzCapabilities(monitorId: number, enabled = true): PtzState {
  const { t } = useTranslation();
  const controlEnabled = useZmConfig('ZM_OPT_CONTROL', true);
  const q = useQuery({
    queryKey: ['ptz', 'capabilities', monitorId],
    queryFn: () => ptz.getCapabilities(monitorId),
    enabled: enabled && controlEnabled,
    retry: false,
    staleTime: 60_000,
  });

  if (!controlEnabled) {
    return { status: 'no-ptz', message: t('Camera control is turned off in ZoneMinder options (ZM_OPT_CONTROL).') };
  }

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
