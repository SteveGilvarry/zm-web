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
 *
 * `controllable` is the per-camera half of the same test — `Monitors.Controllable`,
 * which legacy checks before it draws the control panel at all
 * (`watch.php`: `if ($monitor->Controllable() and canView('Control'))`).
 * Without it every plain camera asked the backend a question it can only
 * answer 400 to ("Monitor X has no PTZ control configured"), once per watch
 * page load. Pass `null` while the monitor row is still loading — not
 * `undefined`, which a default parameter would read as "yes": the hook then
 * stays in `loading` and asks nothing.
 */
export function usePtzCapabilities(
  monitorId: number,
  enabled = true,
  controllable: boolean | null = true,
): PtzState {
  const { t } = useTranslation();
  const controlEnabled = useZmConfig('ZM_OPT_CONTROL', true);
  const q = useQuery({
    queryKey: ['ptz', 'capabilities', monitorId],
    queryFn: () => ptz.getCapabilities(monitorId),
    enabled: enabled && controlEnabled && controllable === true,
    retry: false,
    staleTime: 60_000,
  });

  if (!controlEnabled) {
    return { status: 'no-ptz', message: t('Camera control is turned off in ZoneMinder options (ZM_OPT_CONTROL).') };
  }

  if (controllable === false) {
    return { status: 'no-ptz', message: t('This monitor is not configured for camera control.') };
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
