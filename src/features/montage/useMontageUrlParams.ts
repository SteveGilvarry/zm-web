import { useEffect, useRef } from 'react';
import { useRouteSearch, searchInt, searchString } from '@/features/monitors/useRouteSearch';
import { useMontageStore, type MontageStatusPosition } from '@/stores/montage';
import { statusPositionFromLegacy } from './layoutFormat';

export interface MontageUrlParams {
  /** `?layout=` — legacy `zmMontageLayout`, a MontageLayouts row id. */
  layoutId: number | undefined;
  /** `?header=0|hidden` — legacy kiosk: the control band is not drawn. */
  headerHidden: boolean;
}

const SHORT_POSITIONS: readonly MontageStatusPosition[] = ['inside', 'outside', 'hidden', 'hover'];

/** `insideImgBottom` and friends, or the store's own short names. */
export function parseStatusPosition(value: string | undefined): MontageStatusPosition | undefined {
  if (!value) return undefined;
  if ((SHORT_POSITIONS as readonly string[]).includes(value)) return value as MontageStatusPosition;
  return statusPositionFromLegacy(value);
}

/**
 * The request params `montage.php` honours, for both skins. `showZones` and
 * `monitorStatusPositionSelected` win over the saved choice and become it,
 * as legacy writes them back to its session and cookie. Each is applied
 * once per value, so the operator can still change the control afterwards.
 * The layout id is returned for the page's own layout logic to resolve.
 */
export function useMontageUrlParams(): MontageUrlParams {
  const search = useRouteSearch();
  const layoutId = searchInt(search, 'layout');
  const rawZones = search.show_zones;
  const showZones = rawZones === 1 || rawZones === '1' ? true : rawZones === 0 || rawZones === '0' ? false : undefined;
  const position = parseStatusPosition(searchString(search, 'status_position'));
  const header = search.header;
  const headerHidden = header === '0' || header === 0 || header === 'hidden';

  const appliedZones = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (showZones == null || appliedZones.current === showZones) return;
    appliedZones.current = showZones;
    useMontageStore.getState().setShowZones(showZones);
  }, [showZones]);

  const appliedPosition = useRef<MontageStatusPosition | undefined>(undefined);
  useEffect(() => {
    if (!position || appliedPosition.current === position) return;
    appliedPosition.current = position;
    useMontageStore.getState().setStatusPosition(position);
  }, [position]);

  return { layoutId, headerHidden };
}
