import { describe, expect, it } from 'vitest';
import type { MonitorAction, MonitorActionTarget } from '@/api/monitorActions';
import { blankRow, planActionChanges, planSize, rowsFromActions, typesFor, updateRow, ACTION_TYPES } from './actionsDraft';

const speaker: MonitorActionTarget = {
  id: 7, name: 'Hall speaker', device_class: 'Speaker', types: ['AudioPlay', 'AudioStop'], min_audio_file: 1, max_audio_file: 5,
};
const light: MonitorActionTarget = {
  id: 8, name: 'Porch cam', device_class: 'Camera', types: ['LightOn', 'LightOff'], min_audio_file: null, max_audio_file: null,
};
const targets = [speaker, light];

const stored = (over: Partial<MonitorAction>): MonitorAction => ({
  id: 1, monitor_id: 2, target_monitor_id: 7, action_type: 'AudioPlay', trigger_on: 'Alarm', audio_file: 2,
  label: '', enabled: true, sequence: 0, ...over,
});

describe('action rows (monitor.js updateMonitorActionRow)', () => {
  it('orders by sequence then id', () => {
    const rows = rowsFromActions([stored({ id: 5, sequence: 1 }), stored({ id: 9, sequence: 0 }), stored({ id: 3, sequence: 1 })]);
    expect(rows.map((r) => r.id)).toEqual([9, 3, 5]);
  });

  it('with no device every type is offered; with one, only what it supports', () => {
    expect(typesFor(undefined)).toEqual(ACTION_TYPES);
    expect(typesFor(light)).toEqual(['LightOn', 'LightOff']);
  });

  it('picking a device snaps the type to one it supports and starts the sound at its minimum', () => {
    const row = blankRow();
    expect(row.action_type).toBe('AudioPlay');
    const onLight = updateRow(row, { target_monitor_id: 8 }, targets);
    expect(onLight.action_type).toBe('LightOn');
    const onSpeaker = updateRow(row, { target_monitor_id: 7 }, targets);
    expect(onSpeaker).toMatchObject({ action_type: 'AudioPlay', audio_file: 1 });
  });
});

describe('planActionChanges', () => {
  const baseline = rowsFromActions([stored({ id: 1 }), stored({ id: 2, target_monitor_id: 8, action_type: 'LightOn' })]);

  it('no edits, no calls', () => {
    expect(planSize(planActionChanges(baseline, baseline, targets))).toBe(0);
  });

  it('sends only the changed fields of a stored row', () => {
    const rows = baseline.map((r) => (r.id === 1 ? { ...r, enabled: false, audio_file: 4 } : r));
    expect(planActionChanges(baseline, rows, targets)).toEqual({
      creates: [], deletes: [], updates: [{ id: 1, input: { enabled: false, audio_file: 4 } }],
    });
  });

  it('a stored row set to no device, or removed, is deleted', () => {
    const cleared = baseline.map((r) => (r.id === 1 ? { ...r, target_monitor_id: null } : r));
    expect(planActionChanges(baseline, cleared, targets).deletes).toEqual([1]);
    expect(planActionChanges(baseline, baseline.slice(1), targets).deletes).toEqual([1]);
  });

  it('a new row with a device is created; one without is ignored', () => {
    const fresh = updateRow(blankRow(3), { target_monitor_id: 8, trigger_on: 'EventEnd' }, targets);
    const plan = planActionChanges(baseline, [...baseline, fresh, blankRow()], targets);
    expect(plan.creates).toEqual([{
      target_monitor_id: 8, action_type: 'LightOn', trigger_on: 'EventEnd', audio_file: null, label: '', enabled: true, sequence: 3,
    }]);
    expect(planSize(plan)).toBe(1);
  });

  it('a row asking a device for something it cannot do is not saved', () => {
    const bad = { ...blankRow(), target_monitor_id: 8, action_type: 'AudioPlay' as const };
    expect(planSize(planActionChanges([], [bad], targets))).toBe(0);
  });
});
