import { describe, expect, it } from 'vitest';
import { effectivePerms } from '@/features/auth/perms';
import { canSeeNav, navRequirement } from './navPerms';

const viewer = effectivePerms({
  perms: {
    stream: 'View', events: 'View', control: 'None', monitors: 'View',
    groups: 'None', devices: 'None', snapshots: 'None', system: 'None',
  },
});
const admin = effectivePerms({
  perms: {
    stream: 'View', events: 'Edit', control: 'Edit', monitors: 'Edit',
    groups: 'Edit', devices: 'Edit', snapshots: 'Edit', system: 'Edit',
  },
});

describe('navRequirement', () => {
  it('maps legacy canView rules', () => {
    expect(navRequirement('/settings')).toEqual({ feature: 'system', level: 'View' });
    expect(navRequirement('/settings/users')).toEqual({ feature: 'system', level: 'View' });
    expect(navRequirement('/settings/ptz-controls')).toEqual({ feature: 'control', level: 'View' });
    expect(navRequirement('/logs')).toEqual({ feature: 'system', level: 'View' });
    expect(navRequirement('/groups')).toEqual({ feature: 'groups', level: 'View' });
    expect(navRequirement('/events')).toEqual({ feature: 'events', level: 'View' });
    expect(navRequirement('/filters')).toEqual({ feature: 'events', level: 'View' });
    expect(navRequirement('/montagereview')).toEqual({ feature: 'stream', level: 'View' });
    expect(navRequirement('/monitors/12')).toEqual({ feature: 'stream', level: 'View' });
  });

  it('leaves Console and the monitors list ungated', () => {
    expect(navRequirement('/')).toBeNull();
    expect(navRequirement('/monitors')).toBeNull();
  });

  it('does not let /montage swallow /montagereview by prefix', () => {
    expect(navRequirement('/montagereview')).toEqual({ feature: 'stream', level: 'View' });
  });
});

describe('canSeeNav', () => {
  it('hides admin pages from a viewer and shows them to an admin', () => {
    expect(canSeeNav(viewer, '/events')).toBe(true);
    expect(canSeeNav(viewer, '/settings')).toBe(false);
    expect(canSeeNav(viewer, '/groups')).toBe(false);
    expect(canSeeNav(viewer, '/')).toBe(true);
    expect(canSeeNav(admin, '/settings/servers')).toBe(true);
  });
});
