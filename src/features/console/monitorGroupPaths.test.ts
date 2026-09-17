/**
 * The Groups line under a console name (`ajax/console.php:416-437`): one
 * line per group, parents first.
 */
import { describe, expect, it } from 'vitest';
import { groupPathsFor } from './monitorGroupPaths';

const GROUPS = [
  { id: 1, name: 'Outside', parent_id: null },
  { id: 2, name: 'Front Yard', parent_id: 1 },
  { id: 3, name: 'Driveway', parent_id: 2 },
  { id: 4, name: 'Inside', parent_id: null },
];
const names = (paths: Array<Array<{ name: string }>>) => paths.map((p) => p.map((g) => g.name));

describe('groupPathsFor', () => {
  it('walks up to the root, root first', () => {
    const paths = groupPathsFor(7, GROUPS, [{ id: 1, group_id: 3, monitor_id: 7 }]);
    expect(names(paths)).toEqual([['Outside', 'Front Yard', 'Driveway']]);
  });

  it('gives one line per group the monitor is in', () => {
    const paths = groupPathsFor(7, GROUPS, [
      { id: 1, group_id: 2, monitor_id: 7 },
      { id: 2, group_id: 4, monitor_id: 7 },
      { id: 3, group_id: 4, monitor_id: 8 },
    ]);
    expect(names(paths)).toEqual([['Outside', 'Front Yard'], ['Inside']]);
  });

  it('returns nothing for a monitor in no group', () => {
    expect(groupPathsFor(9, GROUPS, [{ id: 1, group_id: 2, monitor_id: 7 }])).toEqual([]);
  });

  it('skips a membership whose group has gone', () => {
    expect(groupPathsFor(7, GROUPS, [{ id: 1, group_id: 99, monitor_id: 7 }])).toEqual([]);
  });

  it('stops rather than looping on a parent cycle', () => {
    const cyclic = [
      { id: 1, name: 'A', parent_id: 2 },
      { id: 2, name: 'B', parent_id: 1 },
    ];
    expect(names(groupPathsFor(7, cyclic, [{ id: 1, group_id: 1, monitor_id: 7 }])))
      .toEqual([['B', 'A']]);
  });
});
