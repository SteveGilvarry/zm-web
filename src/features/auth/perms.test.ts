import { describe, expect, it } from 'vitest';
import { effectivePerms, hasPerm, levelSatisfies, NO_PERMS, permLevel } from './perms';

describe('levelSatisfies', () => {
  it('orders None < View < Edit < Create', () => {
    expect(levelSatisfies('View', 'None')).toBe(true);
    expect(levelSatisfies('Edit', 'View')).toBe(true);
    expect(levelSatisfies('Create', 'Edit')).toBe(true);
    expect(levelSatisfies('View', 'Edit')).toBe(false);
    expect(levelSatisfies('None', 'View')).toBe(false);
    expect(levelSatisfies('Edit', 'Create')).toBe(false);
  });
});

describe('effectivePerms', () => {
  it('reads the claim as issued by zm_api', () => {
    const p = effectivePerms({
      perms: { stream: 'View', events: 'Edit', control: 'None', system: 'Edit' },
    });
    expect(p.known).toBe(true);
    expect(permLevel(p, 'stream')).toBe('View');
    expect(hasPerm(p, 'events', 'Edit')).toBe(true);
    expect(hasPerm(p, 'control', 'View')).toBe(false);
  });

  it('treats a feature missing from a present claim as None', () => {
    const p = effectivePerms({ perms: { events: 'View' } });
    expect(permLevel(p, 'groups')).toBe('None');
    expect(hasPerm(p, 'monitors', 'View')).toBe(false);
  });

  it('ignores unknown level strings', () => {
    const p = effectivePerms({ perms: { events: 'Admin' as never } });
    expect(permLevel(p, 'events')).toBe('None');
  });

  it('grants everything when the token predates RBAC (no perms claim)', () => {
    const p = effectivePerms({});
    expect(p.known).toBe(false);
    expect(hasPerm(p, 'system', 'Edit')).toBe(true);
    expect(hasPerm(p, 'stream', 'View')).toBe(true);
  });

  it('NO_PERMS grants nothing', () => {
    expect(hasPerm(NO_PERMS, 'events', 'View')).toBe(false);
  });
});
