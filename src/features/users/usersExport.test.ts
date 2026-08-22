import { describe, expect, it, vi, afterEach } from 'vitest';
import type { User } from '@/types';
import { exportUsers, usersToCsv, usersToJson, USER_EXPORT_COLUMNS } from './usersExport';

const users: User[] = [
  {
    id: 1, username: 'admin', name: 'Site, Admin', email: 'a@x', enabled: 1,
    system: 'Edit', stream: 'View', events: 'Edit', control: 'Edit', monitors: 'Create', groups: 'Edit', devices: 'Edit', snapshots: 'Edit',
  },
  {
    id: 2, username: 'guest', name: '=HYPERLINK("x")', email: '', enabled: 0,
    system: 'None', stream: 'View', events: 'View', control: 'None', monitors: 'View', groups: 'None', devices: 'None', snapshots: 'None',
  },
];

afterEach(() => vi.restoreAllMocks());

describe('usersToCsv', () => {
  it('writes the legacy column order, quotes commas and defuses formulas', () => {
    const csv = usersToCsv(users);
    const [head, row1, row2] = csv.split('\r\n');
    expect(head).toBe(USER_EXPORT_COLUMNS.join(','));
    expect(row1).toBe('1,admin,"Site, Admin",a@x,1,View,Edit,Edit,Create,Edit,Edit,Edit,Edit');
    expect(row2.split(',')[2]).toBe('"\'=HYPERLINK(""x"")"');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});

describe('usersToJson', () => {
  it('emits only the export columns', () => {
    const parsed = JSON.parse(usersToJson(users)) as Record<string, unknown>[];
    expect(parsed).toHaveLength(2);
    expect(Object.keys(parsed[0])).toEqual([...USER_EXPORT_COLUMNS]);
    expect(parsed[1].enabled).toBe(0);
  });
});

describe('exportUsers', () => {
  it('triggers a download named by date and format', () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    exportUsers(users, 'csv');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:x');
    vi.unstubAllGlobals();
  });
});
