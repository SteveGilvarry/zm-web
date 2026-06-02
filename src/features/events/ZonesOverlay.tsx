import { useQuery } from '@tanstack/react-query';
import { listZonesForMonitor, parseCoords } from '@/api/zones';

interface ZonesOverlayProps {
  monitorId: number;
  /** Camera's natural width in pixels — sets the SVG viewBox. */
  monitorWidth: number;
  /** Camera's natural height in pixels — sets the SVG viewBox. */
  monitorHeight: number;
}

/**
 * Read-only SVG overlay that draws the monitor's zones on top of the
 * event video. The viewBox is sized to the camera's native resolution
 * so polygons stretch with the player regardless of player size.
 *
 * Zone colours mirror the editor's palette so an operator who's used to
 * seeing red = privacy / cyan = active in the editor sees the same
 * encoding here.
 */
const ZONE_COLORS: Record<string, { stroke: string; fill: string }> = {
  Active:     { stroke: '#00d4ff', fill: 'rgba(0,212,255,0.15)' },
  Inclusive:  { stroke: '#00ff9d', fill: 'rgba(0,255,157,0.15)' },
  Exclusive:  { stroke: '#ffb000', fill: 'rgba(255,176,0,0.15)' },
  Preclusive: { stroke: '#a855f7', fill: 'rgba(168,85,247,0.15)' },
  Inactive:   { stroke: '#566b85', fill: 'rgba(86,107,133,0.12)' },
  Privacy:    { stroke: '#ff3366', fill: 'rgba(255,51,102,0.20)' },
};

export function ZonesOverlay({ monitorId, monitorWidth, monitorHeight }: ZonesOverlayProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['zones', monitorId],
    queryFn: () => listZonesForMonitor(monitorId, { page: 1, page_size: 50 }),
    enabled: monitorId > 0,
  });

  if (isLoading || !data || data.items.length === 0) return null;

  const w = monitorWidth || 1920;
  const h = monitorHeight || 1080;

  return (
    <svg
      data-testid="zones-overlay"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-label="Monitor zones"
    >
      {data.items.map((zone) => {
        const c = ZONE_COLORS[zone.type] ?? ZONE_COLORS.Active;
        const pts = parseCoords(zone.coords).map((p) => `${p.x},${p.y}`).join(' ');
        if (!pts) return null;
        return (
          <polygon
            key={zone.id}
            data-testid={`zone-${zone.id}`}
            points={pts}
            fill={c.fill}
            stroke={c.stroke}
            strokeOpacity={0.85}
            strokeWidth={Math.max(2, w / 500)}
          />
        );
      })}
    </svg>
  );
}
