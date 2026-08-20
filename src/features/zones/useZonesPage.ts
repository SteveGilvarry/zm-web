import { useQuery } from '@tanstack/react-query';
import { getMonitor } from '@/api/monitors';
import { useAuthStore } from '@/stores/auth';
import { isOrientationRotated, type Monitor } from '@/types';

export interface ZoneViewDimensions {
  width: number;
  height: number;
}

/**
 * The frame size the zone editor should draw in. ZoneMinder stores zone
 * coordinates in the *view* space — after orientation is applied — so a
 * ROTATE_90 / ROTATE_270 camera's editor is `height × width`, not
 * `width × height`.
 */
export function zoneViewDimensions(
  monitor: Pick<Monitor, 'width' | 'height' | 'orientation'>,
): ZoneViewDimensions {
  return isOrientationRotated(monitor.orientation)
    ? { width: monitor.height, height: monitor.width }
    : { width: monitor.width, height: monitor.height };
}

export interface ZonesPageState {
  monitorId: number;
  monitor: Monitor | undefined;
  isLoading: boolean;
  /** Editor frame size (rotation applied); null until the monitor loads. */
  view: ZoneViewDimensions | null;
  /** The monitor loaded and has a usable frame size. */
  hasDimensions: boolean;
}

export function useZonesPage(monitorId: number): ZonesPageState {
  const { isAuthenticated } = useAuthStore();

  const monitorQ = useQuery({
    queryKey: ['monitor', monitorId],
    queryFn: () => getMonitor(monitorId),
    enabled: isAuthenticated && !!monitorId,
  });
  const monitor = monitorQ.data;
  const view = monitor ? zoneViewDimensions(monitor) : null;

  return {
    monitorId,
    monitor,
    isLoading: monitorQ.isLoading,
    view,
    hasDimensions: !!(view && view.width && view.height),
  };
}
