/**
 * The label map and the rail edges `optionsTabs.test.ts` does not reach:
 * every legacy caption, an empty backend, and a backend that serves only
 * categories the legacy order has never heard of.
 */
import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import {
  DISPLAY_TAB, HIDDEN_CONFIG_CATEGORIES, buildOptionsTabs, optionsTabLabel, visibleCategories,
} from './optionsTabs';

/** The setup file loads i18n with no catalogue, so `t(key) === key`. */
const t = ((key: string) => key) as unknown as TFunction;

describe('optionsTabLabel — every legacy caption', () => {
  it('maps each known key to its legacy caption', () => {
    const expected: Record<string, string> = {
      [DISPLAY_TAB]: 'Display',
      system: 'System',
      auth: 'Auth',
      config: 'Config',
      api: 'API',
      servers: 'Servers',
      storage: 'Storage',
      web: 'Web',
      images: 'Images',
      logging: 'Logging',
      network: 'Network',
      mail: 'Email',
      upload: 'Upload',
      x10: 'X10',
      control: 'Control',
      mqtt: 'MQTT',
      telemetry: 'Telemetry',
      version: 'Versions',
      users: 'Users',
      groups: 'Groups',
      ai_datasets: 'AI Datasets',
      ai_models: 'AI Models',
      ai_classes: 'AI Classes',
      state: 'Run State',
    };
    for (const [key, caption] of Object.entries(expected)) {
      expect(optionsTabLabel(t, key), key).toBe(caption);
    }
  });

  it('returns the raw key for anything unknown, including the empty string', () => {
    expect(optionsTabLabel(t, 'zm_future_category')).toBe('zm_future_category');
    expect(optionsTabLabel(t, '')).toBe('');
  });
});

describe('visibleCategories — matching is case-insensitive', () => {
  it('drops hidden categories however the backend spells them', () => {
    const names = visibleCategories(
      [{ name: 'HighBand', count: 1 }, { name: 'HIDDEN', count: 2 }, { name: 'System', count: 3 }],
      true,
    ).map((c) => c.name);
    expect(names).toEqual(['System']);
  });

  it('gates X10 regardless of case', () => {
    expect(visibleCategories([{ name: 'X10', count: 1 }], false)).toEqual([]);
    expect(visibleCategories([{ name: 'X10', count: 1 }], true)).toEqual([{ name: 'X10', count: 1 }]);
  });

  it('lists exactly the categories the rail refuses to show', () => {
    expect([...HIDDEN_CONFIG_CATEGORIES].sort()).toEqual(
      ['dynamic', 'hidden', 'highband', 'lowband', 'medband'],
    );
  });
});

describe('buildOptionsTabs — edges', () => {
  it('still renders the page tabs when the backend serves no categories', () => {
    const tabs = buildOptionsTabs([], false);
    expect(tabs.every((tab) => tab.kind === 'page')).toBe(true);
    expect(tabs.map((tab) => tab.key)).toEqual([
      'display', 'api', 'servers', 'storage', 'control', 'users', 'groups',
      'ai_datasets', 'ai_models', 'ai_classes', 'state',
    ]);
  });

  it('puts wholly unknown categories directly after the Display tab', () => {
    // No legacy category matches, so `lastIndexOf('category')` is -1 and the
    // extras land at index 0 — ahead of every page tab.
    const tabs = buildOptionsTabs([{ name: 'onvif', count: 1 }, { name: 'ai', count: 2 }], false);
    expect(tabs.map((tab) => tab.key)).toEqual([
      'onvif', 'ai', 'display', 'api', 'servers', 'storage', 'control', 'users', 'groups',
      'ai_datasets', 'ai_models', 'ai_classes', 'state',
    ]);
    expect(tabs[0]).toEqual({ kind: 'category', key: 'onvif', category: 'onvif' });
  });

  it('lower-cases the extras key but keeps the backend spelling as the filter value', () => {
    const tabs = buildOptionsTabs([{ name: 'system', count: 1 }, { name: 'ONVIF', count: 2 }], false);
    expect(tabs.find((tab) => tab.key === 'onvif')).toEqual(
      { kind: 'category', key: 'onvif', category: 'ONVIF' },
    );
  });

  it('always renders the API token page tab, and never a second one', () => {
    // Legacy's API tab is `_options_api.php`, not a config category — and
    // `options.php` matches `tab == 'API'` before it looks at the categories,
    // so a backend that also has an `api` category still gets one pill.
    const tabs = buildOptionsTabs([{ name: 'system', count: 1 }, { name: 'api', count: 2 }], false);
    const keys = tabs.map((tab) => tab.key);
    expect(keys.filter((k) => k === 'api')).toHaveLength(1);
    expect(tabs.find((tab) => tab.key === 'api')).toEqual(
      { kind: 'page', key: 'api', to: '/settings/api-tokens' },
    );
  });

  it('gives the three AI admin tabs their own pages at the end of the rail', () => {
    const tabs = buildOptionsTabs([], false);
    expect(tabs.filter((tab) => tab.key.startsWith('ai_'))).toEqual([
      { kind: 'page', key: 'ai_datasets', to: '/settings/ai/datasets' },
      { kind: 'page', key: 'ai_models', to: '/settings/ai/models' },
      { kind: 'page', key: 'ai_classes', to: '/settings/ai/classes' },
    ]);
  });
});
