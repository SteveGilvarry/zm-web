import { describe, expect, it } from 'vitest';
import { makeRole } from '@/test/fixtures/optionsAdmin';
import { ROLE_EDITOR_ROWS, ROLE_TABLE_COLUMNS, roleChanges, roleCreateInput, roleToForm } from './roleFields';

describe('roleFields', () => {
  it('table columns follow _options_roles.php', () => {
    expect(ROLE_TABLE_COLUMNS).toEqual(['stream', 'events', 'control', 'monitors', 'groups', 'snapshots', 'system', 'devices']);
  });

  it('editor rows follow role.php, with its level sets', () => {
    expect(ROLE_EDITOR_ROWS.map((r) => r.key)).toEqual(['stream', 'events', 'snapshots', 'control', 'monitors', 'groups', 'system', 'devices']);
    expect(ROLE_EDITOR_ROWS.find((r) => r.key === 'stream')!.levels).toEqual(['None', 'View']);
    expect(ROLE_EDITOR_ROWS.find((r) => r.key === 'monitors')!.levels).toEqual(['None', 'View', 'Edit', 'Create']);
  });

  it('a new role starts with every level at None', () => {
    const form = roleToForm(null);
    expect(form.name).toBe('');
    expect(form.description).toBe('');
    for (const k of ROLE_TABLE_COLUMNS) expect(form[k]).toBe('None');
  });

  it('roleCreateInput trims the name and leaves a blank description out', () => {
    const input = roleCreateInput({ ...roleToForm(null), name: '  Night shift ', events: 'Edit' });
    expect(input).toEqual({
      name: 'Night shift', stream: 'None', events: 'Edit', control: 'None', monitors: 'None',
      groups: 'None', snapshots: 'None', system: 'None', devices: 'None',
    });
    expect(roleCreateInput({ ...roleToForm(null), name: 'x', description: 'why' }).description).toBe('why');
  });

  it('roleChanges sends only what moved, and a cleared description as null', () => {
    const role = makeRole({ description: 'old' });
    expect(roleChanges(role, roleToForm(role))).toEqual({});
    expect(roleChanges(role, { ...roleToForm(role), system: 'View', name: ' Ops ' })).toEqual({ system: 'View', name: 'Ops' });
    expect(roleChanges(role, { ...roleToForm(role), description: '' })).toEqual({ description: null });
  });
});
