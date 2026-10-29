/**
 * Encoder Parameters text helpers, ported from legacy
 * `views/js/monitor-encoder-templates.js` and `includes/EncoderTemplates.php`
 * (ZoneMinder 1.39.41): parse the `key=value` list, merge a template into it,
 * write it back, and flag keys the chosen encoder will ignore.
 */

export interface EncoderParam {
  key: string;
  value: string;
}

/**
 * Pairs split on newline, comma or `#` (what `av_dict_parse_string` in
 * `zm_videostore.cpp` does), each split on its first `=`, key and value
 * trimmed. Pairs without `=` or with an empty key are dropped.
 */
export function parseParams(text: string | null | undefined): EncoderParam[] {
  if (!text) return [];
  const out: EncoderParam[] = [];
  for (const pair of String(text).split(/[#,\n]/)) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const key = pair.slice(0, idx).trim();
    if (key) out.push({ key, value: pair.slice(idx + 1).trim() });
  }
  return out;
}

/**
 * Template keys already in the text keep their place and take the
 * template's value; new keys go on the end; keys only in the text stay.
 * A template's params are `key=value` lines on the wire, so they go through
 * {@link parseParams} first (legacy's PHP does the same before handing them
 * to the browser).
 */
export function mergeParams(existing: EncoderParam[], template: EncoderParam[]): EncoderParam[] {
  const result = existing.map((e) => ({ ...e }));
  const positions = new Map(result.map((e, i) => [e.key, i]));
  for (const { key, value } of template) {
    const at = positions.get(key);
    if (at != null) result[at].value = value;
    else {
      positions.set(key, result.length);
      result.push({ key, value });
    }
  }
  return result;
}

/** One `key=value` per line. */
export function serializeParams(params: EncoderParam[]): string {
  return params.map((p) => `${p.key}=${p.value}`).join('\n');
}

/** Legacy Apply: the textarea's params with the template's merged in. */
export function applyTemplateParams(current: string | null | undefined, templateParams: string): string {
  return serializeParams(mergeParams(parseParams(current), parseParams(templateParams)));
}

/**
 * `EncoderTemplates::VALID_KEYS`: the options legacy knows each encoder
 * takes. Hand-curated upstream; an encoder missing here gets no lint.
 */
const VALID_KEYS: Record<string, readonly string[]> = {
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

/** Keys in `text` the encoder does not take, each once, in order. Empty when legacy has no list for it. */
export function unknownParamKeys(text: string | null | undefined, encoder: string | null | undefined): string[] {
  const valid = encoder ? VALID_KEYS[encoder] : undefined;
  if (!valid) return [];
  const out: string[] = [];
  for (const { key } of parseParams(text)) {
    if (!valid.includes(key) && !out.includes(key)) out.push(key);
  }
  return out;
}
