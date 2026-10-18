import { useZmConfig } from '@/features/config/useZmConfig';
import { useViewingTimeout, type ViewingTimeoutState } from '@/features/monitors/useViewingTimeout';

/**
 * Legacy montage.js `inactivityTime`: after `ZM_WEB_VIEWING_TIMEOUT` seconds
 * without a mouse move or key press, stop every stream on the wall and ask
 * "Are you still watching?". Answering starts them again. `prompted` doubles
 * as "streams stopped": the wall renders no live cells while it is up.
 */
export function useMontageIdle(enabled: boolean): ViewingTimeoutState {
  const timeoutS = useZmConfig('ZM_WEB_VIEWING_TIMEOUT', 0);
  // The cells read `prompted` themselves, so there is nothing to stop or
  // start by hand.
  return useViewingTimeout({ enabled, timeoutS, onIdle: () => {}, onResume: () => {} });
}
