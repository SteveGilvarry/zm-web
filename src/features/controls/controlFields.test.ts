import { describe, expect, it } from 'vitest';
import i18next from '@/i18n';
import type { Control } from '@/api/controls';
import {
  CONTROL_FIELD_KEYS,
  CONTROL_TABS,
  controlFieldLabel,
  controlTabLabel,
  controlToForm,
  emptyControlForm,
  formToPayload,
  presetsCell,
} from './controlFields';

const t = i18next.t.bind(i18next);

const sample: Control = {
  id: 3, name: 'Pelco-P', type: 'Local', protocol: 'PelcoP',
  can_pan: 1, can_tilt: 1, can_zoom: 0, can_move: 1, can_move_abs: 0, can_move_rel: 1, can_move_con: 1, can_move_diag: 1, can_move_map: 0,
  can_auto_zoom: 0, can_zoom_abs: 0, can_zoom_rel: 0, can_zoom_con: 0, has_zoom_speed: 0,
  can_focus: 0, can_auto_focus: 0, can_focus_abs: 0, can_focus_rel: 0, can_focus_con: 0, has_focus_speed: 0,
  can_iris: 0, can_auto_iris: 0, can_iris_abs: 0, can_iris_rel: 0, can_iris_con: 0, has_iris_speed: 0,
  can_gain: 0, can_auto_gain: 0, can_gain_abs: 0, can_gain_rel: 0, can_gain_con: 0, has_gain_speed: 0,
  can_white: 0, can_auto_white: 0, can_white_abs: 0, can_white_rel: 0, can_white_con: 0, has_white_speed: 0,
  has_presets: 1, num_presets: 20, has_home_preset: 1, can_set_presets: 1,
  has_pan_speed: 1, has_turbo_pan: 1, has_tilt_speed: 1, has_turbo_tilt: 0,
  can_wake: 1, can_sleep: 1, can_reset: 0, can_reboot: 0,
  can_auto_scan: 0, num_scan_paths: 0,
  min_pan_speed: 1, max_pan_speed: 63, turbo_pan_speed: 64, max_pan_range: null,
};

describe('CONTROL_TABS', () => {
  it('follows the legacy controlcap tab order and field count', () => {
    expect(CONTROL_TABS.map((tab) => tab.key)).toEqual([
      'main', 'move', 'pan', 'tilt', 'zoom', 'focus', 'gain', 'white', 'iris', 'presets', 'misc',
    ]);
    // 3 main text/select + 4 power flags, 6 move, 10 pan, 10 tilt, 12 zoom
    // (legacy's 11 plus the API's can_auto_zoom), 12 × focus/gain/white/iris,
    // 4 presets, 2 misc — the 99 keys of CreateControlRequest.
    expect(CONTROL_TABS.find((tab) => tab.key === 'pan')!.fields).toHaveLength(10);
    expect(CONTROL_TABS.find((tab) => tab.key === 'zoom')!.fields).toHaveLength(12);
    expect(CONTROL_TABS.find((tab) => tab.key === 'focus')!.fields).toHaveLength(12);
    expect(CONTROL_FIELD_KEYS).toHaveLength(99);
  });

  it('covers every key of ControlResponse exactly once', () => {
    const keys = new Set(CONTROL_FIELD_KEYS);
    expect(keys.size).toBe(CONTROL_FIELD_KEYS.length);
    for (const key of Object.keys(sample)) {
      if (key === 'id') continue;
      expect(keys.has(key as never), key).toBe(true);
    }
  });

  it('labels every field and tab with legacy captions', () => {
    for (const tab of CONTROL_TABS) {
      expect(controlTabLabel(t, tab.key)).not.toBe('');
      for (const f of tab.fields) {
        const label = controlFieldLabel(t, f.key);
        expect(label, f.key).not.toBe(f.key);
      }
    }
    expect(controlFieldLabel(t, 'can_move_diag')).toBe('Can Move Diag');
    expect(controlFieldLabel(t, 'min_pan_range')).toBe('Min Pan Range');
    expect(controlFieldLabel(t, 'has_zoom_speed')).toBe('Has Zoom Speed');
    expect(controlFieldLabel(t, 'can_auto_white')).toBe('Can Auto White');
    expect(controlFieldLabel(t, 'can_focus_con')).toBe('Can Focus Con');
  });
});

describe('form round trip', () => {
  it('starts blank with Local type and flags off', () => {
    const form = emptyControlForm();
    expect(form.type).toBe('Local');
    expect(form.can_pan).toBe(0);
    expect(form.min_pan_range).toBe('');
    expect(form.name).toBe('');
  });

  it('loads a control into the form and back without loss', () => {
    const form = controlToForm(sample);
    expect(form.min_pan_speed).toBe('1');
    expect(form.max_pan_range).toBe('');
    expect(form.has_turbo_pan).toBe(1);
    const payload = formToPayload(form);
    expect(payload.name).toBe('Pelco-P');
    expect(payload.protocol).toBe('PelcoP');
    expect(payload.min_pan_speed).toBe(1);
    expect(payload.max_pan_range).toBeNull();
    expect(payload.can_pan).toBe(1);
    expect(payload.can_zoom).toBe(0);
  });

  it('sends blank protocol and unparseable numbers as null, flags always as 0/1', () => {
    const form = emptyControlForm();
    form.name = '  New ';
    form.protocol = '   ';
    form.min_tilt_range = 'abc';
    const payload = formToPayload(form);
    expect(payload.name).toBe('New');
    expect(payload.protocol).toBeNull();
    expect(payload.min_tilt_range).toBeNull();
    expect(payload.can_wake).toBe(0);
    expect(Object.keys(payload)).toHaveLength(CONTROL_FIELD_KEYS.length);
  });
});

describe('presetsCell', () => {
  it('prefixes H when the profile has a home preset, like legacy', () => {
    expect(presetsCell({ has_presets: 1, num_presets: 64, has_home_preset: 1 })).toBe('H64');
    expect(presetsCell({ has_presets: 1, num_presets: 8, has_home_preset: 0 })).toBe('8');
    expect(presetsCell({ has_presets: 0, num_presets: 8, has_home_preset: 1 })).toBe('0');
  });
});
