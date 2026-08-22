import type { InspectProfile, InspectResult } from '@/api/discovery';
import type { MonitorCreateInput } from '@/api/monitors-crud';

export interface StreamSource {
  /** The URI with any embedded credentials removed — what goes in `path` for an FFmpeg monitor. */
  path: string;
  host: string;
  port: string;
  user?: string;
  pass?: string;
}

/**
 * Split an RTSP/HTTP stream URI into the pieces the monitor form wants.
 * Credentials embedded in the URI win over the fallbacks; ZoneMinder keeps
 * them in `user`/`pass` rather than in the path. Returns `null` when the
 * string is not a URL at all.
 */
export function parseStreamUri(uri: string, fallback?: { user?: string; pass?: string }): StreamSource | null {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return null;
  }
  const user = url.username ? decodeURIComponent(url.username) : fallback?.user;
  const pass = url.password ? decodeURIComponent(url.password) : fallback?.pass;
  url.username = '';
  url.password = '';
  return {
    path: url.toString(),
    host: url.hostname,
    port: url.port || (url.protocol === 'rtsp:' ? '554' : url.protocol === 'https:' ? '443' : '80'),
    user: user || undefined,
    pass: pass || undefined,
  };
}

/**
 * Prefill for the Add dialog from an inspected device + one of its media
 * profiles: FFmpeg source on the profile's stream URI, the profile's
 * resolution, and the ONVIF endpoint + credentials so events and PTZ can
 * be enabled afterwards.
 */
export function prefillFromProfile(
  result: InspectResult,
  profile: InspectProfile,
  creds: { username: string; password: string },
  candidateName?: string | null,
): Partial<MonitorCreateInput> {
  const out: Partial<MonitorCreateInput> = {
    type: 'Ffmpeg',
    onvif_url: result.device_service,
    onvif_username: creds.username,
    onvif_password: creds.password,
  };
  const nameParts = [result.manufacturer, result.model].filter(Boolean);
  out.name = candidateName || (nameParts.length ? nameParts.join(' ') : '');
  if (profile.width && profile.height) {
    out.width = profile.width;
    out.height = profile.height;
  }
  if (profile.stream_uri) {
    const src = parseStreamUri(profile.stream_uri, { user: creds.username, pass: creds.password });
    if (src) {
      out.path = src.path;
      out.host = src.host;
      out.port = src.port;
      if (src.user) out.user = src.user;
      if (src.pass) out.pass = src.pass;
    }
  }
  if (result.ptz_service) {
    out.controllable = 1;
    out.control_device = profile.token;
  }
  return out;
}
