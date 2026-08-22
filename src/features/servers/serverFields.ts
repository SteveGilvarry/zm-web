import type { Server } from '@/api/servers';

/**
 * Read-only projections of a `Servers` row for the legacy cluster table.
 *
 * `ServerResponse` carries the whole row since zm-api#25; `UpdateServerRequest`
 * still takes only name/hostname/port/status, so everything below is display
 * only. A zm_api older than #25 sends just those five fields and these
 * helpers render blanks — there is deliberately no fallback for it.
 */

/** Ports the scheme already implies, which legacy leaves out of the Url. */
const DEFAULT_PORTS: Record<string, number> = { http: 80, https: 443 };

export type ServerAddress = Pick<Server, 'protocol' | 'hostname' | 'port'>;

/**
 * The legacy `Url` column: `Protocol://Hostname:Port`, e.g.
 * `https://zm-node-1.local:8443`.
 *
 * - No hostname → no url at all (the row has nothing to address).
 * - No protocol → bare `host:port`; inventing `http://` would be a guess,
 *   and a fresh row from `POST /servers` really does have `protocol: null`.
 * - Port omitted when absent or implied by the scheme (80/http, 443/https).
 */
export function serverUrl(server: ServerAddress): string | null {
  const hostname = server.hostname?.trim();
  if (!hostname) return null;

  const protocol = server.protocol?.trim().replace(/:\/*$/, '').toLowerCase() || null;
  const port = server.port != null && server.port > 0 ? server.port : null;
  const implied = protocol != null && DEFAULT_PORTS[protocol] === port;
  const authority = port != null && !implied ? `${hostname}:${port}` : hostname;

  return protocol ? `${protocol}://${authority}` : authority;
}

/** The four per-server daemon flags ZoneMinder stores (`Servers` has no `zmtelemetry`). */
export type ServerDaemon = 'zmstats' | 'zmaudit' | 'zmtrigger' | 'zmeventnotification';

export const SERVER_DAEMONS: readonly ServerDaemon[] = [
  'zmstats',
  'zmaudit',
  'zmtrigger',
  'zmeventnotification',
];

export interface ServerDaemonFlag {
  daemon: ServerDaemon;
  enabled: boolean;
}

/** Daemon flags in legacy's RunStats / RunAudit / RunTrigger / RunEventNotification order. */
export function serverDaemons(server: Partial<Record<ServerDaemon, number>>): ServerDaemonFlag[] {
  return SERVER_DAEMONS.map((daemon) => ({ daemon, enabled: server[daemon] === 1 }));
}

function coordNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * `Latitude, Longitude` as a plain decimal pair — deliberately not localised,
 * since a coordinate with a comma decimal separator reads as two numbers.
 * Half a pair points nowhere, so one missing side means no coordinate.
 */
export function serverCoords(server: Pick<Server, 'latitude' | 'longitude'>): string | null {
  const lat = coordNumber(server.latitude);
  const lon = coordNumber(server.longitude);
  if (lat == null || lon == null) return null;
  return `${lat}, ${lon}`;
}
