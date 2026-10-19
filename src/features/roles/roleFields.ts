import type { TFunction } from 'i18next';
import type { Role, RoleInput } from '@/api/roles';

export type RolePermKey = 'stream' | 'events' | 'control' | 'monitors' | 'groups' | 'snapshots' | 'system' | 'devices';

/** `_options_roles.php` column order. */
export const ROLE_TABLE_COLUMNS: readonly RolePermKey[] = [
  'stream', 'events', 'control', 'monitors', 'groups', 'snapshots', 'system', 'devices',
];

/**
 * `role.php` Global Permissions rows, in its order, with the levels each
 * select offers: Stream is None/View, Monitors adds Create, the rest are
 * None/View/Edit. Snapshots only shows while `ZM_FEATURES_SNAPSHOTS` is on.
 */
export const ROLE_EDITOR_ROWS: ReadonlyArray<{ key: RolePermKey; levels: readonly string[] }> = [
  { key: 'stream', levels: ['None', 'View'] },
  { key: 'events', levels: ['None', 'View', 'Edit'] },
  { key: 'snapshots', levels: ['None', 'View', 'Edit'] },
  { key: 'control', levels: ['None', 'View', 'Edit'] },
  { key: 'monitors', levels: ['None', 'View', 'Edit', 'Create'] },
  { key: 'groups', levels: ['None', 'View', 'Edit'] },
  { key: 'system', levels: ['None', 'View', 'Edit'] },
  { key: 'devices', levels: ['None', 'View', 'Edit'] },
];

export function rolePermLabel(t: TFunction, key: RolePermKey): string {
  switch (key) {
    case 'stream': return t('Stream');
    case 'events': return t('Events');
    case 'control': return t('Control');
    case 'monitors': return t('Monitors');
    case 'groups': return t('Groups');
    case 'snapshots': return t('Snapshots');
    case 'system': return t('System');
    case 'devices': return t('Devices');
  }
}

export function permLevelLabel(t: TFunction, level: string): string {
  switch (level) {
    case 'None': return t('None');
    case 'View': return t('View');
    case 'Edit': return t('Edit');
    case 'Create': return t('Create');
    default: return level;
  }
}

export interface RoleForm extends Record<RolePermKey, string> {
  name: string;
  description: string;
}

/** A new role grants nothing: zm-api defaults omitted levels to None too. */
export function roleToForm(role: Role | null | undefined): RoleForm {
  return {
    name: role?.name ?? '',
    description: role?.description ?? '',
    stream: role?.stream ?? 'None',
    events: role?.events ?? 'None',
    control: role?.control ?? 'None',
    monitors: role?.monitors ?? 'None',
    groups: role?.groups ?? 'None',
    snapshots: role?.snapshots ?? 'None',
    system: role?.system ?? 'None',
    devices: role?.devices ?? 'None',
  };
}

/** The whole form as a create request; a blank description is left out. */
export function roleCreateInput(form: RoleForm): RoleInput {
  const { description, ...rest } = form;
  return { ...rest, name: form.name.trim(), ...(description.trim() ? { description } : {}) };
}

/** Only the fields that differ from `role`. A cleared description is sent as null. */
export function roleChanges(role: Role, form: RoleForm): Partial<RoleInput> {
  const before = roleToForm(role);
  const out: Partial<RoleInput> = {};
  for (const k of Object.keys(form) as (keyof RoleForm)[]) {
    if (form[k] === before[k]) continue;
    if (k === 'description') out.description = form.description === '' ? null : form.description;
    else if (k === 'name') out.name = form.name.trim();
    else out[k] = form[k];
  }
  return out;
}
