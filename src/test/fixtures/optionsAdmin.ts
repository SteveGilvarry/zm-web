import type { Role } from '@/api/roles';
import type { MenuItem } from '@/api/menuItems';
import type { EncoderTemplate } from '@/api/encoderTemplates';

/**
 * Factories for the Options admin tabs (roles, menu, encoder templates).
 * Shapes follow the 2026-10-20 zm-api build on the dev box.
 */
export function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 1,
    name: 'Operators',
    description: null,
    stream: 'View',
    events: 'View',
    control: 'None',
    monitors: 'None',
    groups: 'None',
    devices: 'None',
    snapshots: 'None',
    system: 'None',
    ...overrides,
  };
}

/** The dev box's seeded rows: every built-in, enabled, ten apart. */
export const DEFAULT_MENU_ROWS: ReadonlyArray<[string, number]> = [
  ['Console', 10], ['Watch', 15], ['Montage', 20], ['MontageReview', 30], ['Events', 40],
  ['Options', 50], ['Log', 60], ['Devices', 70], ['IntelGpu', 80], ['Groups', 90],
  ['Filters', 100], ['Snapshots', 110], ['Reports', 120], ['ReportEventAudit', 130], ['Map', 140],
];

export function makeMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 1,
    menu_key: 'Console',
    enabled: true,
    label: null,
    sort_order: 10,
    icon: null,
    icon_type: 'material',
    link: null,
    ...overrides,
  };
}

export function defaultMenu(): MenuItem[] {
  return DEFAULT_MENU_ROWS.map(([menu_key, sort_order], i) => makeMenuItem({ id: i + 1, menu_key, sort_order }));
}

export function makeEncoderTemplate(overrides: Partial<EncoderTemplate> = {}): EncoderTemplate {
  return {
    id: 1,
    encoder: 'libx264',
    name: 'Balanced',
    description: '1080p recording with reasonable CPU cost. Good default for most cameras.',
    params: 'preset=fast\ncrf=23\ng=30\nprofile=high\npix_fmt=yuv420p',
    ...overrides,
  };
}
