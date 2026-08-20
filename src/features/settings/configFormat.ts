import i18next from '@/i18n';
import type { ZmConfig } from '@/types';

// Backend Config rows carry a `type` discriminator and a `hint` field.
// For string configs whose hint contains pipe-separated tokens
// (e.g. "hashed|plain|none"), the hint IS the enum option list.

const ENUM_HINT_RE = /^[A-Za-z0-9_-]+(\|[A-Za-z0-9_-]+)+$/;

export function enumOptionsFromHint(hint?: string | null): string[] | null {
  if (!hint) return null;
  return ENUM_HINT_RE.test(hint) ? hint.split('|') : null;
}

// Display helper for the read-only value cell — booleans render as
// enabled/disabled badges, passwords as "•••" so the secret doesn't leak.
export function formatConfigValue(config: ZmConfig): string {
  if (config.type === 'boolean') return config.value === '1' ? i18next.t('enabled') : i18next.t('disabled');
  if (config.type === 'password' && config.value) return '•'.repeat(Math.min(config.value.length, 8));
  return config.value;
}

// Acronyms that should stay all-caps when humanising a lowercase identifier.
const ACRONYMS = new Set([
  'api', 'cgi', 'cpu', 'css', 'csp', 'csrf', 'db', 'dns', 'eap', 'ffmpeg',
  'gpu', 'hls', 'http', 'https', 'id', 'ip', 'jpeg', 'json', 'jwt', 'ldap',
  'lts', 'mp4', 'mqtt', 'nfs', 'onvif', 'os', 'pid', 'png', 'ptz', 'rest',
  'rtsp', 'rtmp', 'sdp', 'shm', 'smtp', 'snmp', 'sql', 'ssh', 'ssl', 'tcp',
  'tls', 'ttl', 'udp', 'url', 'uri', 'usb', 'uuid', 'vnc', 'vpn', 'wifi',
  'ws', 'wss', 'x10', 'xml', 'zm',
]);

/**
 * Turn a backend identifier (snake_case / lowercase token / dash-separated)
 * into a human-readable Title Case label. Acronyms stay uppercase; other
 * tokens get their initial letter capitalised. Used for Settings category
 * names and string-enum option labels.
 */
export function humanizeIdent(s: string): string {
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((tok) => ACRONYMS.has(tok.toLowerCase())
      ? tok.toUpperCase()
      : tok.charAt(0).toUpperCase() + tok.slice(1))
    .join(' ');
}
