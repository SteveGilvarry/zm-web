/**
 * The subset of C/PHP `strftime` ZoneMinder's date-format options use.
 *
 * `ZM_DATE_FORMAT_PATTERN`, `ZM_DATETIME_FORMAT_PATTERN` and
 * `ZM_TIME_FORMAT_PATTERN` are strftime strings (`%a %d %b %Y %H:%M:%S`)
 * that the PHP UI passes to `strftime()`. PHP dropped `strftime()` and
 * JavaScript never had it, so we format the parts with `Intl.DateTimeFormat`
 * — which also gets us the operator's locale and an explicit time zone —
 * and substitute them into the pattern.
 *
 * Unsupported directives are left as-is rather than guessed at, so a pattern
 * we do not understand degrades to visible text instead of a wrong date.
 */

export interface StrftimeOptions {
  /** IANA zone (e.g. `Australia/Sydney`); defaults to the viewer's. */
  timeZone?: string;
  /** BCP 47 locale for names and numerals; defaults to the viewer's. */
  locale?: string;
}

type Parts = Record<string, string>;

function partsFor(date: Date, opts: StrftimeOptions): Parts {
  const { timeZone, locale } = opts;
  const base: Intl.DateTimeFormatOptions = timeZone ? { timeZone } : {};
  const read = (o: Intl.DateTimeFormatOptions): Parts => {
    const out: Parts = {};
    for (const p of new Intl.DateTimeFormat(locale, { ...base, ...o }).formatToParts(date)) {
      out[p.type] = p.value;
    }
    return out;
  };

  const numeric = read({
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const names = read({ weekday: 'long', month: 'long' });
  const short = read({ weekday: 'short', month: 'short' });
  const h12 = read({ hour: '2-digit', hour12: true });
  const zoneShort = read({ timeZoneName: 'short' }).timeZoneName ?? '';
  const zoneLong = read({ timeZoneName: 'long' }).timeZoneName ?? '';

  // `hour: '2-digit', hour12: false` yields "24" at midnight in some engines.
  const hour24 = numeric.hour === '24' ? '00' : (numeric.hour ?? '00');

  return {
    a: short.weekday ?? '',
    A: names.weekday ?? '',
    b: short.month ?? '',
    B: names.month ?? '',
    d: numeric.day ?? '',
    e: String(Number(numeric.day ?? '0')).padStart(2, ' '),
    H: hour24,
    I: h12.hour ?? '',
    j: String(dayOfYear(date, timeZone)).padStart(3, '0'),
    m: numeric.month ?? '',
    M: numeric.minute ?? '',
    p: (h12.dayPeriod ?? '').toUpperCase(),
    P: (h12.dayPeriod ?? '').toLowerCase(),
    S: numeric.second ?? '',
    y: (numeric.year ?? '').slice(-2),
    Y: numeric.year ?? '',
    Z: zoneShort,
    z: zoneLong,
    n: '\n',
    t: '\t',
    '%': '%',
  };
}

function dayOfYear(date: Date, timeZone?: string): number {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    ...(timeZone ? { timeZone } : {}),
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const [y, m, d] = fmt.format(date).split('-').map(Number);
  const start = Date.UTC(y, 0, 1);
  return Math.floor((Date.UTC(y, m - 1, d) - start) / 86_400_000) + 1;
}

/** Composite directives, expanded before the single-letter pass. */
const COMPOSITES: Record<string, string> = {
  D: '%m/%d/%y',
  F: '%Y-%m-%d',
  R: '%H:%M',
  T: '%H:%M:%S',
  r: '%I:%M:%S %p',
  c: '%a %b %e %H:%M:%S %Y',
  x: '%m/%d/%y',
  X: '%H:%M:%S',
};

export function strftime(pattern: string, date: Date, opts: StrftimeOptions = {}): string {
  if (Number.isNaN(date.getTime())) return '';
  let expanded = pattern;
  for (let i = 0; i < 3; i += 1) {
    const next = expanded.replace(/%([DFRTrcxX])/g, (whole, key: string) => COMPOSITES[key] ?? whole);
    if (next === expanded) break;
    expanded = next;
  }
  const parts = partsFor(date, opts);
  return expanded.replace(/%(.)/g, (whole, key: string) =>
    key in parts ? parts[key] : whole,
  );
}

/** True when the string looks like a strftime pattern we can render. */
export function isStrftimePattern(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.includes('%');
}
