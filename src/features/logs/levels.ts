/**
 * Legacy's Level multi-select (`includes/logpanel.php:134-151`): one option
 * per `ZM\Logger::$codes` entry, in that order, each an **exact** match on
 * `Logs.Level` (`ajax/log.php:210-225`). DBG is level 1 only, as legacy
 * maps it; OFF is NOLOG (-6), which ZoneMinder never writes, so choosing it
 * alone matches nothing, exactly as it does in legacy.
 */
export const LOG_LEVEL_CODES = ['DBG', 'INF', 'WAR', 'ERR', 'FAT', 'PNC', 'AUD', 'OFF'] as const;
export type LogLevelCode = (typeof LOG_LEVEL_CODES)[number];

/** `ZM\Logger` constants (`includes/logger.php:9-16`). */
export const LOG_LEVEL_BY_CODE: Record<LogLevelCode, number> = {
  DBG: 1, INF: 0, WAR: -1, ERR: -2, FAT: -3, PNC: -4, AUD: -5, OFF: -6,
};

/**
 * Read the URL's `level` (a comma list of codes, `ERR,WAR`) into the
 * known codes, deduplicated and in legacy's order. Unknown entries are
 * dropped, the way `ajax/log.php` keeps only recognised codes.
 */
export function parseLevelCodes(raw: unknown): LogLevelCode[] {
  if (typeof raw !== 'string' || raw === '') return [];
  const picked = new Set(raw.split(',').map((s) => s.trim().toUpperCase()));
  return LOG_LEVEL_CODES.filter((c) => picked.has(c));
}

/** The codes as the URL carries them, or undefined for "All". */
export function levelCodesParam(codes: readonly LogLevelCode[]): string | undefined {
  const ordered = LOG_LEVEL_CODES.filter((c) => codes.includes(c));
  return ordered.length ? ordered.join(',') : undefined;
}

/** The codes as zm-api's `level` comma list (`-2,-1`), or undefined for "All". */
export function levelCodesToApi(codes: readonly LogLevelCode[]): string | undefined {
  return codes.length ? codes.map((c) => LOG_LEVEL_BY_CODE[c]).join(',') : undefined;
}
