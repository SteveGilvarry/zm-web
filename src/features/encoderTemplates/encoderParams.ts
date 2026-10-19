import type { EncoderTemplate } from '@/api/encoderTemplates';

/**
 * The encoders legacy offers (`_options_encoderTemplates.php`, the
 * `encoderTemplate` modal) and the option names each accepts
 * (`includes/EncoderTemplates.php` `VALID_KEYS`). Pass-through options like
 * `x264-params` are listed; their inner sub-options are not.
 */
export const ENCODER_VALID_KEYS: Readonly<Record<string, readonly string[]>> = {
  libx264: [
    'preset', 'tune', 'profile', 'level', 'crf', 'qp', 'b',
    'maxrate', 'bufsize', 'g', 'keyint_min', 'sc_threshold',
    'bf', 'refs', 'pix_fmt', 'x264-params', 'x264opts',
  ],
  libx265: [
    'preset', 'tune', 'profile', 'level', 'crf', 'qp', 'b',
    'maxrate', 'bufsize', 'g', 'keyint_min', 'sc_threshold',
    'bf', 'refs', 'pix_fmt', 'x265-params',
  ],
  h264_nvenc: [
    'preset', 'tune', 'profile', 'level', 'rc', 'cq', 'qp', 'b',
    'maxrate', 'bufsize', 'g', 'bf', 'spatial-aq', 'temporal-aq',
    'rc-lookahead', 'pix_fmt', 'gpu', 'tuning_info',
  ],
  hevc_nvenc: [
    'preset', 'tune', 'profile', 'level', 'rc', 'cq', 'qp', 'b',
    'maxrate', 'bufsize', 'g', 'bf', 'spatial-aq', 'temporal-aq',
    'rc-lookahead', 'pix_fmt', 'gpu', 'tuning_info', 'tier',
  ],
  h264_vaapi: [
    'profile', 'level', 'rc_mode', 'qp', 'b', 'maxrate', 'bufsize',
    'g', 'bf', 'pix_fmt', 'low_power', 'idr_interval',
  ],
  hevc_vaapi: [
    'profile', 'level', 'rc_mode', 'qp', 'b', 'maxrate', 'bufsize',
    'g', 'bf', 'pix_fmt', 'low_power', 'idr_interval', 'tier',
  ],
};

export const ENCODERS: readonly string[] = Object.keys(ENCODER_VALID_KEYS);

export interface ParamPair {
  key: string;
  value: string;
}

/**
 * Legacy `parseParams` (`monitor-encoder-templates.js`): pairs split on
 * newline, `,` or `#` as ffmpeg's `av_dict_parse_string` does, each split
 * on its first `=`, trimmed. Pairs without `=` or with an empty key drop.
 */
export function parseParams(text: string | null | undefined): ParamPair[] {
  if (!text) return [];
  const out: ParamPair[] = [];
  for (const p of String(text).split(/[#,\n]/)) {
    const idx = p.indexOf('=');
    if (idx < 0) continue;
    const key = p.slice(0, idx).trim();
    if (key) out.push({ key, value: p.slice(idx + 1).trim() });
  }
  return out;
}

/**
 * Legacy `lint`: keys the encoder does not recognise, each once, in order.
 * An encoder with no known key list gets no opinion.
 */
export function lintParams(parsed: readonly ParamPair[], encoder: string): string[] {
  const valid = ENCODER_VALID_KEYS[encoder];
  if (!valid) return [];
  const known = new Set(valid);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { key } of parsed) {
    if (!known.has(key) && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/**
 * The Params cell: `key=value` pairs joined by spaces and cut at 60
 * characters with an ellipsis (`mb_strimwidth`); the title holds one pair
 * per line.
 */
export function paramsSummary(params: string): { short: string; full: string } {
  const lines = parseParams(params).map((p) => `${p.key}=${p.value}`);
  const joined = lines.join(' ');
  const chars = Array.from(joined);
  return {
    short: chars.length > 60 ? `${chars.slice(0, 59).join('')}…` : joined,
    full: lines.join('\n'),
  };
}

/**
 * Legacy table order (`EncoderTemplates::all()`): the known encoders in
 * their fixed order, then any other encoder as the rows first name it;
 * within an encoder, by name.
 */
export function orderTemplates(templates: readonly EncoderTemplate[]): EncoderTemplate[] {
  const rank = new Map(ENCODERS.map((e, i) => [e, i]));
  const firstSeen = new Map<string, number>();
  for (const tpl of templates) if (!firstSeen.has(tpl.encoder)) firstSeen.set(tpl.encoder, firstSeen.size);
  const order = (enc: string) => rank.get(enc) ?? ENCODERS.length + (firstSeen.get(enc) ?? 0);
  return [...templates].sort((a, b) => order(a.encoder) - order(b.encoder) || a.name.localeCompare(b.name));
}
