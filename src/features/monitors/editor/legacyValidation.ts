/**
 * The checks legacy runs before saving a monitor (`monitor.js.php`
 * `validateForm`, plus the `validateName` ajax), on top of the per-field
 * bounds in `validateDraft`. Errors block Save; warnings ask first.
 * Messages are legacy's English strings.
 */
import type { FieldErrors, FieldValue, Translate } from './fields';

/** `Monitor::getDefaults()['Name']['filter_regexp']`: anything else is a bad character. */
const BAD_NAME_CHARS = /[^\w\p{L}\p{M}\p{N}\-.():/ ]/gu;

/** Characters legacy warns may need percent-encoding in an FFmpeg path. */
const NOT_ENCODED = /[!*'()$ ,#]/;

export interface OtherMonitors {
  /** Names of every other monitor. */
  names: ReadonlySet<string>;
  /** RTSP stream names in use by other monitors. */
  rtspStreamNames: ReadonlySet<string>;
}

const text = (v: FieldValue | undefined) => (v == null ? '' : String(v).trim());

export function legacyErrors(draft: Record<string, FieldValue>, others: OtherMonitors, t: Translate): FieldErrors {
  const errors: FieldErrors = {};
  const type = String(draft.type ?? '');

  const name = text(draft.name);
  const bad = [...new Set(name.match(BAD_NAME_CHARS) ?? [])];
  if (bad.length) {
    errors.name = `${t('The monitor name contains invalid characters, such as:')} "${bad.join('","')}". ${t('Names may only contain letters, numbers, parentheses, slashes, and the space, period, minus, colon, and underscore characters.')}`;
  } else if (name && others.names.has(name)) {
    errors.name = t('Duplicate Monitor Name');
  }

  const passthrough = Number(draft.video_writer) === 2;
  const path = text(draft.path);
  if (type === 'Local') {
    if (!/^\/dev\/[\w/.-]+$/.test(text(draft.device))) errors.device = t('Device must be set to a valid value');
  }
  if (type === 'Ffmpeg' && !path) errors.path = t('Source -> Path must be set to a valid value');
  if (type === 'File' && !path) errors.path = t('Source -> Path must be set to a valid value');
  if (type === 'WebSite' && !/^https?:\/\//i.test(path)) {
    errors.path = t('Please enter a complete website url, including the http:// or https:// prefix.');
  }
  if (passthrough && ['Local', 'Remote', 'File'].includes(type)) {
    errors.video_writer = t('Recording -> Passthrough only works with ffmpeg type monitors.');
  }

  if (type !== 'WebSite') {
    // Only values the row has: an older API that omits a column must not block Save.
    if (draft.image_buffer_count != null && !(Number(draft.image_buffer_count) >= 2)) {
      errors.image_buffer_count = t('Image buffer size must be an integer of 2 or more');
    }
    const max = Number(draft.max_image_buffer_count) || 0;
    if (max && Number(draft.pre_event_count) > max) {
      errors.pre_event_count = t('Max Image Buffer Count should be greater than Pre event image count or else it cannot be satisfied');
    }
    if (draft.section_length != null && !(Number(draft.section_length) >= 10)) {
      errors.section_length = t('Section length must be an integer of 10 or more');
    }
  }

  const rtspName = text(draft.rtsp_stream_name);
  if (rtspName && others.rtspStreamNames.has(rtspName)) errors.rtsp_stream_name = t('Duplicate RTSP Stream Name');

  return errors;
}

export function legacyWarnings(draft: Record<string, FieldValue>, t: Translate): string[] {
  const warnings: string[] = [];
  const type = String(draft.type ?? '');
  if (type === 'Ffmpeg' && NOT_ENCODED.test(text(draft.path))) {
    warnings.push(t('Source -> Path must be set to a valid value. We have detected invalid characters !*\'()$ ,#[] that may need to be url percent encoded.'));
  }
  const off = (v: FieldValue | undefined) => v != null && Number(v) === 0;
  if (type !== 'WebSite' && String(draft.recording ?? 'None') !== 'None'
    && off(draft.save_jpe_gs) && off(draft.video_writer)) {
    warnings.push(t('SaveJPEGs and VideoWriter are both set to disabled.  Nothing will be recorded!'));
  }
  return warnings;
}

/**
 * Legacy `change_Path`: credentials typed or pasted into an FFmpeg URL
 * (`rtsp://user:pass@host/…`) move into Username / Password, and the URL
 * keeps the rest. Returns null when the URL carries none.
 */
export function splitPathCredentials(path: string): { path: string; user: string; pass: string } | null {
  const proto = path.indexOf('://');
  if (proto === -1) return null;
  const at = path.indexOf('@', proto + 3);
  if (at === -1) return null;
  const colon = path.indexOf(':', proto + 3);
  if (colon === -1 || colon >= at) return null;
  const user = path.substring(proto + 3, colon);
  const pass = path.substring(colon + 1, at);
  if (!user || !pass) return null;
  let decoded = pass;
  try { decoded = decodeURIComponent(pass); } catch { /* keep as typed */ }
  return { path: path.substring(0, proto + 3) + path.substring(at + 1), user, pass: decoded };
}
