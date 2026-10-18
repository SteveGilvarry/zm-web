import { describe, expect, it } from 'vitest';
import type { Frame } from '@/api/frames';
import type { Stat } from '@/api/stats';
import {
  formatStat, formatStats, frameNeighbours, maxScoreFrame, pixelsWithShare, zonePixelArea,
} from './statsTable';

function stat(over: Partial<Stat> = {}): Stat {
  return {
    id: 1, monitor_id: 1, zone_id: 3, event_id: 42, frame_id: 7,
    pixel_diff: 25, alarm_pixels: 0, filter_pixels: 0, blob_pixels: 0, blobs: 0,
    min_blob_size: 0, max_blob_size: 0, min_x: 0, max_x: 0, min_y: 0, max_y: 0, score: 0,
    ...over,
  };
}

function frame(frame_id: number, score: number): Frame {
  return { id: 100 + frame_id, event_id: 42, frame_id, type: 'Normal', score, time_stamp: '', delta: '0' };
}

/** The left half of the picture in percent space: shoelace area 50 × 100 = 5000. */
const leftHalf = { id: 3, name: 'Driveway', area: 5000, coords: '0,0 50,0 50,100 0,100' };

describe('zonePixelArea', () => {
  it('turns a percent-space area into pixels, as getStatsTableHTML does', () => {
    // 5000 / 10000 × 640 × 480
    expect(zonePixelArea(leftHalf, 640, 480)).toBe(153600);
  });

  it('keeps a zone stored in pixels as it is', () => {
    expect(zonePixelArea({ area: 76800, coords: '0,0 320,0 320,240 0,240' }, 640, 480)).toBe(76800);
  });

  it('never divides by zero', () => {
    expect(zonePixelArea({ area: 0, coords: '0,0 0,0 0,0' }, 640, 480)).toBe(1);
    expect(zonePixelArea(undefined, 640, 480)).toBe(1);
  });
});

describe('formatStat', () => {
  // Worked through stats.php by hand for a 640×480 monitor and the zone above
  // (pixel area 153600):
  //   AlarmPixels 15360  → 100 × 15360 / 153600 = 10      → "15360 (10%)"
  //   FilterPixels 10000 → 6.51…, %d truncates            → "10000 (6%)"
  //   BlobPixels 9999    → 6.509…                          → "9999 (6%)"
  //   Blobs 2, sizes 1000 / 8000 → 0.65… / 5.20…           → "1000-8000 (0%-5%)"
  //   AlarmLimits                                          → "12,34-300,400"
  const row = formatStat(
    stat({
      alarm_pixels: 15360, filter_pixels: 10000, blob_pixels: 9999, blobs: 2,
      min_blob_size: 1000, max_blob_size: 8000,
      min_x: 12, min_y: 34, max_x: 300, max_y: 400, score: 17,
    }),
    leftHalf, 640, 480,
  );

  it('prints each count with its truncated share of the zone', () => {
    expect(row.zoneName).toBe('Driveway');
    expect(row.pixelDiff).toBe(25);
    expect(row.alarmPx).toBe('15360 (10%)');
    expect(row.filterPx).toBe('10000 (6%)');
    expect(row.blobPx).toBe('9999 (6%)');
    expect(row.blobs).toBe(2);
    expect(row.blobSizes).toBe('1000-8000 (0%-5%)');
    expect(row.alarmLimits).toBe('12,34-300,400');
    expect(row.score).toBe(17);
  });

  it('prints one blob size when there is at most one blob', () => {
    const one = formatStat(stat({ blobs: 1, min_blob_size: 7680, max_blob_size: 7680 }), leftHalf, 640, 480);
    expect(one.blobSizes).toBe('7680 (5%)');
  });

  it('gives the frame view one decimal, as ajax/stats.php raw does', () => {
    expect(pixelsWithShare(10000, 153600, 1)).toBe('10000 (6.5%)');
    const one = formatStat(stat({ filter_pixels: 10000 }), leftHalf, 640, 480, 1);
    expect(one.filterPx).toBe('10000 (6.5%)');
  });

  it('leaves the name empty for a zone that no longer exists', () => {
    expect(formatStat(stat(), undefined, 640, 480).zoneName).toBe('');
  });
});

describe('formatStats', () => {
  it('orders rows by zone id', () => {
    const rows = formatStats(
      [stat({ id: 2, zone_id: 9 }), stat({ id: 1, zone_id: 3 })],
      [leftHalf, { id: 9, name: 'Porch', area: 100, coords: '0,0 10,0 10,10 0,10' }],
      640, 480,
    );
    expect(rows.map((r) => r.zoneName)).toEqual(['Driveway', 'Porch']);
  });
});

describe('maxScoreFrame', () => {
  it('takes the highest score, earliest frame on a tie', () => {
    expect(maxScoreFrame([frame(1, 3), frame(2, 40), frame(3, 40), frame(4, 9)])?.frame_id).toBe(2);
    expect(maxScoreFrame([])).toBeNull();
  });
});

describe('frameNeighbours', () => {
  const frames = [frame(1, 0), frame(2, 0), frame(4, 0), frame(5, 0)];

  it('walks to the stored frames either side', () => {
    expect(frameNeighbours(frames, 2, 5)).toEqual({
      first: 1, prev: 1, next: 4, last: 5, canBack: true, canForward: true,
    });
  });

  it('stops at the ends', () => {
    expect(frameNeighbours(frames, 1, 5)).toMatchObject({ prev: null, canBack: false, canForward: true });
    expect(frameNeighbours(frames, 5, 5)).toMatchObject({ next: null, canBack: true, canForward: false });
  });

  it('caps Next at the last frame stored, even when the event claims more', () => {
    expect(frameNeighbours(frames, 5, 90).canForward).toBe(false);
  });
});
