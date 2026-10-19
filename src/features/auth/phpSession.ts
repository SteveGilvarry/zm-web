/**
 * Read what the PHP UI left in `Sessions.data` (`session_encode()`): a
 * sequence of `key|<serialized value>` pairs. Legacy's logout modal decodes
 * each row to list who else is signed in (`ajax/modals/logout.php`); zm-web
 * has no PHP, so it reads the same bytes here.
 *
 * Handles the types ZoneMinder writes: strings, integers, doubles, booleans,
 * null and arrays (the `user` row is one). A row it cannot parse yields
 * whatever came before the bad token; callers treat a missing `username` as
 * a session that isn't signed in, as legacy does.
 */
export type PhpValue = string | number | boolean | null | PhpValue[] | { [k: string]: PhpValue };

export function parsePhpSession(data: string): Record<string, PhpValue> {
  const out: Record<string, PhpValue> = {};
  let i = 0;
  try {
    while (i < data.length) {
      const bar = data.indexOf('|', i);
      if (bar < 0) break;
      const key = data.slice(i, bar);
      const [value, next] = readValue(data, bar + 1);
      out[key] = value;
      i = next;
    }
  } catch {
    // Truncated or foreign data: keep the pairs read so far.
  }
  return out;
}

function readValue(s: string, i: number): [PhpValue, number] {
  const type = s[i];
  switch (type) {
    case 'N': return [null, expect(s, i + 1, ';')];
    case 'b': { const [n, j] = readNumber(s, i + 2); return [n === 1, expect(s, j, ';')]; }
    case 'i':
    case 'd': { const [n, j] = readNumber(s, i + 2); return [n, expect(s, j, ';')]; }
    case 's': {
      const [len, j] = readNumber(s, i + 2);
      const start = expect(s, expect(s, j, ':'), '"');
      // `len` counts UTF-8 bytes, not characters: walk the text until that
      // many bytes have gone by, so an accented name ends on the right quote.
      let end = start;
      for (let bytes = 0; bytes < len && end < s.length; end++) bytes += utf8Bytes(s.codePointAt(end)!);
      return [s.slice(start, end), expect(s, expect(s, end, '"'), ';')];
    }
    case 'a': {
      const [count, j] = readNumber(s, i + 2);
      let k = expect(s, expect(s, j, ':'), '{');
      const entries: Array<[PhpValue, PhpValue]> = [];
      for (let n = 0; n < count; n++) {
        const [key, afterKey] = readValue(s, k);
        const [value, afterValue] = readValue(s, afterKey);
        entries.push([key, value]);
        k = afterValue;
      }
      k = expect(s, k, '}');
      const isList = entries.every(([key], idx) => key === idx);
      if (isList) return [entries.map(([, v]) => v), k];
      const obj: { [k: string]: PhpValue } = {};
      for (const [key, value] of entries) obj[String(key)] = value;
      return [obj, k];
    }
    default:
      throw new Error(`unknown php type ${type} at ${i}`);
  }
}

function utf8Bytes(cp: number): number {
  return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
}

function readNumber(s: string, i: number): [number, number] {
  const m = /^-?\d+(\.\d+)?/.exec(s.slice(i));
  if (!m) throw new Error(`number expected at ${i}`);
  return [Number(m[0]), i + m[0].length];
}

function expect(s: string, i: number, ch: string): number {
  if (s[i] !== ch) throw new Error(`${ch} expected at ${i}`);
  return i + 1;
}

export interface LoggedInUser {
  username: string;
  /** `Users.Id` from the session's `user` row, for the link; null when absent. */
  userId: number | null;
  remoteAddr: string;
  /** Unix seconds of the last request. */
  access: number;
}

/**
 * Legacy's query and filter (`logout.php:33-70`): rows touched within
 * `ZM_COOKIE_LIFETIME`, newest first, at most 100; a row with `last_time`
 * set is a dead session and one without `username` isn't signed in.
 */
export function loggedInUsers(
  rows: Array<{ access?: number | null; data?: string | null }>,
  cookieLifetimeSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): LoggedInUser[] {
  const cutoff = nowSeconds - cookieLifetimeSeconds;
  return rows
    .filter((r): r is { access: number; data: string } => typeof r.access === 'number' && r.access > cutoff && typeof r.data === 'string')
    .sort((a, b) => b.access - a.access)
    .slice(0, 100)
    .flatMap((r) => {
      const s = parsePhpSession(r.data);
      if (s.last_time != null) return [];
      if (typeof s.username !== 'string' || !s.username) return [];
      const user = s.user;
      const id = user && typeof user === 'object' && !Array.isArray(user) ? user.Id : null;
      return [{
        username: s.username,
        userId: typeof id === 'number' ? id : null,
        remoteAddr: typeof s.remoteAddr === 'string' ? s.remoteAddr : '',
        access: r.access,
      }];
    });
}
