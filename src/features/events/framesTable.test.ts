import { describe, expect, it } from 'vitest';
import type { Frame } from '@/api/frames';
import {
  FRAMES_DEFAULT_HIDDEN, filterFrames, frameField, framesToCsv, sortFrames,
  type FramesColumnKey,
} from './framesTable';

const frame = (frameId: number, type: string, delta: number, score: number): Frame => ({
  id: frameId,
  event_id: 42,
  frame_id: frameId,
  type,
  score,
  time_stamp: `2026-09-17T12:00:0${frameId}Z`,
  delta: String(delta),
});

const rows = [
  frame(1, 'Normal', 0, 0),
  frame(2, 'Alarm', 1.5, 37),
  frame(3, 'Normal', 2.25, 4),
];
const ALL: FramesColumnKey[] = ['event_id', 'frame_id', 'type', 'time_stamp', 'delta', 'score'];

describe('frames table helpers', () => {
  it('hides Event Id by default, as legacy does', () => {
    expect(FRAMES_DEFAULT_HIDDEN).toEqual(['event_id']);
  });

  it('renders the delta to two places, which is also what a search matches', () => {
    expect(frameField(rows[2], 'delta')).toBe('2.25');
  });

  it('searches the visible columns only, case-insensitively', () => {
    expect(filterFrames(rows, 'alarm', ALL).map((f) => f.frame_id)).toEqual([2]);
    // Type is hidden, so "alarm" no longer matches anything.
    expect(filterFrames(rows, 'alarm', ['frame_id', 'score'])).toEqual([]);
    expect(filterFrames(rows, '  ', ALL)).toHaveLength(3);
  });

  it('sorts numerically on numeric columns and flips with the direction', () => {
    expect(sortFrames(rows, 'score', 'desc').map((f) => f.score)).toEqual([37, 4, 0]);
    expect(sortFrames(rows, 'score', 'asc').map((f) => f.score)).toEqual([0, 4, 37]);
    // A string sort would put "2.25" before "1.5".
    expect(sortFrames(rows, 'delta', 'asc').map((f) => f.frame_id)).toEqual([1, 2, 3]);
  });

  it('sorts text columns alphabetically and leaves the rows alone with no column', () => {
    expect(sortFrames(rows, 'type', 'asc').map((f) => f.type)).toEqual(['Alarm', 'Normal', 'Normal']);
    expect(sortFrames(rows, null, 'asc')).toBe(rows);
  });

  it('exports the visible columns with English headers', () => {
    const csv = framesToCsv(rows, ['frame_id', 'type', 'score', 'thumbnail']);
    expect(csv.split('\n')).toEqual([
      'Frame Id,Type,Score',
      '1,Normal,0',
      '2,Alarm,37',
      '3,Normal,4',
    ]);
  });
});
