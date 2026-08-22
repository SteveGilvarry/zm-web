import type { TFunction } from 'i18next';
import type { Control } from '@/api/controls';

/**
 * The legacy `?view=controlcap` form, tab by tab (`controlcap.php`: main,
 * move, pan, tilt, zoom, focus, gain, white, iris, presets). `CanLight` /
 * `CanIndicatorLight` exist in newer ZoneMinder schemas but not in
 * `ControlResponse`, so they are not offered. Auto-scan lives in the
 * request/response but has no legacy tab; it gets a Misc tab.
 */
export type ControlTabKey =
  | 'main' | 'move' | 'pan' | 'tilt' | 'zoom' | 'focus'
  | 'gain' | 'white' | 'iris' | 'presets' | 'misc';

export type ControlFieldKey = Exclude<keyof Control, 'id'>;

export type ControlField =
  | { key: 'name'; kind: 'text'; required: true }
  | { key: 'protocol'; kind: 'text'; required?: false }
  | { key: 'type'; kind: 'type' }
  | { key: ControlFieldKey; kind: 'flag' }
  | { key: ControlFieldKey; kind: 'number' };

export interface ControlTab {
  key: ControlTabKey;
  fields: ControlField[];
}

/** `Controls.Type` enum (`MonitorType`), as legacy's Type select lists it. */
export const CONTROL_TYPES = ['Local', 'Remote', 'Ffmpeg', 'Libvlc', 'Curl', 'WebSite', 'Vnc', 'File'] as const;

const flag = (key: ControlFieldKey): ControlField => ({ key, kind: 'flag' });
const num = (key: ControlFieldKey): ControlField => ({ key, kind: 'number' });

/** Range / step / speed block shared by the seven axis tabs. */
function axis(
  name: 'pan' | 'tilt' | 'zoom' | 'focus' | 'gain' | 'white' | 'iris',
  head: ControlField[],
  tail: ControlField[] = [],
): ControlField[] {
  const k = (s: string) => s as ControlFieldKey;
  return [
    ...head,
    num(k(`min_${name}_range`)), num(k(`max_${name}_range`)),
    num(k(`min_${name}_step`)), num(k(`max_${name}_step`)),
    flag(k(`has_${name}_speed`)),
    num(k(`min_${name}_speed`)), num(k(`max_${name}_speed`)),
    ...tail,
  ];
}

export const CONTROL_TABS: readonly ControlTab[] = [
  {
    key: 'main',
    fields: [
      { key: 'name', kind: 'text', required: true },
      { key: 'type', kind: 'type' },
      { key: 'protocol', kind: 'text' },
      flag('can_wake'), flag('can_sleep'), flag('can_reset'), flag('can_reboot'),
    ],
  },
  {
    key: 'move',
    fields: [
      flag('can_move'), flag('can_move_diag'), flag('can_move_map'),
      flag('can_move_abs'), flag('can_move_rel'), flag('can_move_con'),
    ],
  },
  { key: 'pan', fields: axis('pan', [flag('can_pan')], [flag('has_turbo_pan'), num('turbo_pan_speed')]) },
  { key: 'tilt', fields: axis('tilt', [flag('can_tilt')], [flag('has_turbo_tilt'), num('turbo_tilt_speed')]) },
  { key: 'zoom', fields: axis('zoom', [flag('can_zoom'), flag('can_auto_zoom'), flag('can_zoom_abs'), flag('can_zoom_rel'), flag('can_zoom_con')]) },
  { key: 'focus', fields: axis('focus', [flag('can_focus'), flag('can_auto_focus'), flag('can_focus_abs'), flag('can_focus_rel'), flag('can_focus_con')]) },
  { key: 'gain', fields: axis('gain', [flag('can_gain'), flag('can_auto_gain'), flag('can_gain_abs'), flag('can_gain_rel'), flag('can_gain_con')]) },
  { key: 'white', fields: axis('white', [flag('can_white'), flag('can_auto_white'), flag('can_white_abs'), flag('can_white_rel'), flag('can_white_con')]) },
  { key: 'iris', fields: axis('iris', [flag('can_iris'), flag('can_auto_iris'), flag('can_iris_abs'), flag('can_iris_rel'), flag('can_iris_con')]) },
  {
    key: 'presets',
    fields: [flag('has_presets'), num('num_presets'), flag('has_home_preset'), flag('can_set_presets')],
  },
  { key: 'misc', fields: [flag('can_auto_scan'), num('num_scan_paths')] },
];

/** Every editable key, in tab order. */
export const CONTROL_FIELD_KEYS: readonly ControlFieldKey[] = CONTROL_TABS.flatMap((tab) =>
  tab.fields.map((f) => f.key),
);

export function controlTabLabel(t: TFunction, key: ControlTabKey): string {
  switch (key) {
    case 'main': return t('Main');
    case 'move': return t('Move');
    case 'pan': return t('Pan');
    case 'tilt': return t('Tilt');
    case 'zoom': return t('Zoom');
    case 'focus': return t('Focus');
    case 'gain': return t('Gain');
    case 'white': return t('White');
    case 'iris': return t('Iris');
    case 'presets': return t('Presets');
    case 'misc': return t('Misc');
  }
}

const AXIS_WORD: Record<string, (t: TFunction) => string> = {
  pan: (t) => t('Pan'),
  tilt: (t) => t('Tilt'),
  zoom: (t) => t('Zoom'),
  focus: (t) => t('Focus'),
  gain: (t) => t('Gain'),
  white: (t) => t('White'),
  iris: (t) => t('Iris'),
  move: (t) => t('Move'),
};

/**
 * Legacy captions (`CanMoveDiag` → "Can Move Diag", `MinPanRange` → "Min Pan
 * Range"). Built from the key so the 95 labels stay one function; the
 * axis word is translated, the verb/noun parts are translated per pattern.
 */
export function controlFieldLabel(t: TFunction, key: ControlFieldKey): string {
  switch (key) {
    case 'name': return t('Name');
    case 'type': return t('Type');
    case 'protocol': return t('Protocol');
    case 'can_wake': return t('Can Wake');
    case 'can_sleep': return t('Can Sleep');
    case 'can_reset': return t('Can Reset');
    case 'can_reboot': return t('Can Reboot');
    case 'can_move_diag': return t('Can Move Diag');
    case 'can_move_map': return t('Can Move Map');
    case 'has_presets': return t('Has Presets');
    case 'num_presets': return t('Num Presets');
    case 'has_home_preset': return t('Has Home Preset');
    case 'can_set_presets': return t('Can Set Presets');
    case 'can_auto_scan': return t('Can Auto Scan');
    case 'num_scan_paths': return t('Num Scan Paths');
    case 'turbo_pan_speed': return t('Turbo Pan Speed');
    case 'turbo_tilt_speed': return t('Turbo Tilt Speed');
    case 'has_turbo_pan': return t('Has Turbo Pan');
    case 'has_turbo_tilt': return t('Has Turbo Tilt');
  }
  let m = /^can_(move|pan|tilt|zoom|focus|gain|white|iris)$/.exec(key);
  if (m) return t('Can {{axis}}', { axis: AXIS_WORD[m[1]](t) });
  m = /^can_auto_(zoom|focus|gain|white|iris)$/.exec(key);
  if (m) return t('Can Auto {{axis}}', { axis: AXIS_WORD[m[1]](t) });
  m = /^can_(move|zoom|focus|gain|white|iris)_(abs|rel|con)$/.exec(key);
  if (m) {
    const axisWord = AXIS_WORD[m[1]](t);
    if (m[2] === 'abs') return t('Can {{axis}} Abs', { axis: axisWord });
    if (m[2] === 'rel') return t('Can {{axis}} Rel', { axis: axisWord });
    return t('Can {{axis}} Con', { axis: axisWord });
  }
  m = /^has_(pan|tilt|zoom|focus|gain|white|iris)_speed$/.exec(key);
  if (m) return t('Has {{axis}} Speed', { axis: AXIS_WORD[m[1]](t) });
  m = /^(min|max)_(pan|tilt|zoom|focus|gain|white|iris)_(range|step|speed)$/.exec(key);
  if (m) {
    const axisWord = AXIS_WORD[m[2]](t);
    const min = m[1] === 'min';
    if (m[3] === 'range') return min ? t('Min {{axis}} Range', { axis: axisWord }) : t('Max {{axis}} Range', { axis: axisWord });
    if (m[3] === 'step') return min ? t('Min {{axis}} Step', { axis: axisWord }) : t('Max {{axis}} Step', { axis: axisWord });
    return min ? t('Min {{axis}} Speed', { axis: axisWord }) : t('Max {{axis}} Speed', { axis: axisWord });
  }
  return key;
}

/** Form values: flags are 0/1, numbers are strings while typing, text is text. */
export type ControlFormValues = Record<ControlFieldKey, string | number | null>;

export function emptyControlForm(): ControlFormValues {
  const out = {} as ControlFormValues;
  for (const tab of CONTROL_TABS) {
    for (const f of tab.fields) {
      out[f.key] = f.kind === 'flag' ? 0 : f.kind === 'type' ? 'Local' : f.kind === 'number' ? '' : '';
    }
  }
  return out;
}

export function controlToForm(c: Control): ControlFormValues {
  const out = emptyControlForm();
  for (const tab of CONTROL_TABS) {
    for (const f of tab.fields) {
      const v = c[f.key];
      if (f.kind === 'flag') out[f.key] = v ? 1 : 0;
      else if (f.kind === 'number') out[f.key] = v == null ? '' : String(v);
      else out[f.key] = v == null ? '' : String(v);
    }
  }
  return out;
}

/**
 * Wire payload. Blank numbers go out as null (the columns are nullable);
 * blank protocol too. Flags are always sent so unticking sticks.
 */
export function formToPayload(values: ControlFormValues): Omit<Control, 'id'> {
  const out: Record<string, unknown> = {};
  for (const tab of CONTROL_TABS) {
    for (const f of tab.fields) {
      const v = values[f.key];
      if (f.kind === 'flag') out[f.key] = v ? 1 : 0;
      else if (f.kind === 'number') {
        const n = v === '' || v == null ? null : Number(v);
        out[f.key] = n != null && Number.isFinite(n) ? n : null;
      } else if (f.key === 'protocol') out[f.key] = typeof v === 'string' && v.trim() ? v.trim() : null;
      else out[f.key] = typeof v === 'string' ? v.trim() : v;
    }
  }
  return out as unknown as Omit<Control, 'id'>;
}

/** Legacy list column: `H64` when the profile has a home preset, else the count. */
export function presetsCell(c: Pick<Control, 'has_presets' | 'num_presets' | 'has_home_preset'>): string {
  if (!c.has_presets) return '0';
  return `${c.has_home_preset ? 'H' : ''}${c.num_presets ?? 0}`;
}
