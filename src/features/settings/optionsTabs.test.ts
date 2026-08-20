import { describe, expect, it } from 'vitest';
import { buildOptionsTabs, optionsTabLabel, visibleCategories } from './optionsTabs';

// The dev box's /configs/categories on 2026-08-21.
const DEV_BOX = [
  'auth', 'config', 'dynamic', 'hidden', 'highband', 'images', 'logging', 'lowband',
  'mail', 'medband', 'MQTT', 'network', 'system', 'telemetry', 'upload', 'version',
  'web', 'x10',
].map((name) => ({ name, count: 1 }));

describe('visibleCategories', () => {
  it('drops bandwidth, hidden and dynamic', () => {
    const names = visibleCategories(DEV_BOX, true).map((c) => c.name);
    for (const gone of ['highband', 'medband', 'lowband', 'hidden', 'dynamic']) {
      expect(names).not.toContain(gone);
    }
    expect(names).toContain('MQTT');
  });

  it('gates x10 on ZM_OPT_X10', () => {
    expect(visibleCategories(DEV_BOX, false).map((c) => c.name)).not.toContain('x10');
    expect(visibleCategories(DEV_BOX, true).map((c) => c.name)).toContain('x10');
  });
});

describe('buildOptionsTabs', () => {
  it('follows the legacy order, skipping categories the backend lacks', () => {
    const keys = buildOptionsTabs(DEV_BOX, true).map((t) => t.key);
    expect(keys).toEqual([
      'display', 'system', 'auth', 'config', 'servers', 'storage', 'web', 'images',
      'logging', 'network', 'mail', 'upload', 'x10', 'control', 'mqtt', 'telemetry',
      'version', 'users', 'groups', 'state',
    ]);
  });

  it('keeps the backend spelling as the filter value', () => {
    const mqtt = buildOptionsTabs(DEV_BOX, true).find((t) => t.key === 'mqtt');
    expect(mqtt).toEqual({ kind: 'category', key: 'mqtt', category: 'MQTT' });
  });

  it('appends unknown categories before the page tabs', () => {
    const tabs = buildOptionsTabs([...DEV_BOX, { name: 'onvif', count: 2 }], false);
    const keys = tabs.map((t) => t.key);
    expect(keys.indexOf('onvif')).toBe(keys.indexOf('version') + 1);
    expect(keys.indexOf('onvif')).toBeLessThan(keys.indexOf('users'));
    expect(keys).not.toContain('x10');
  });
});

describe('optionsTabLabel', () => {
  const t = ((k: string) => k) as unknown as Parameters<typeof optionsTabLabel>[0];
  it('maps keys to legacy captions and falls back to the key', () => {
    expect(optionsTabLabel(t, 'mail')).toBe('Email');
    expect(optionsTabLabel(t, 'version')).toBe('Versions');
    expect(optionsTabLabel(t, 'onvif')).toBe('onvif');
  });
});
