import { createFileRoute } from '@tanstack/react-router';
import { MonitorZonesRoute } from '@/features/nav/routeComponents';
import { parseZoneParam } from '@/features/zones/zoneParam';

/** `?zid=` — legacy `?view=zone&mid=&zid=`: the zone open in the editor, `new` for a new one. */
interface ZonesSearchParams {
  zid?: number | 'new';
}

export const Route = createFileRoute('/monitors/$monitorId_/zones')({
  component: MonitorZonesRoute,
  validateSearch: (search: Record<string, unknown>): ZonesSearchParams => {
    const zid = parseZoneParam(search.zid);
    return zid == null ? {} : { zid };
  },
});
