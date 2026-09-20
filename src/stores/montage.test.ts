import { describe, expect, it } from 'vitest';
import { DEFAULT_STAGE_SIZE } from '@/features/monitors/watchStage';
import { DEFAULT_REVIEW_SPEED, useMontageStore } from './montage';

describe('useMontageStore defaults', () => {
  it('starts where legacy montage.php does: caption outside, zones hidden, Auto layout', () => {
    const s = useMontageStore.getState();
    expect(s.statusPosition).toBe('outside');
    expect(s.showZones).toBe(false);
    expect(s.classicLayoutId).toBe('preset:auto');
    expect(s.montageStage).toEqual(DEFAULT_STAGE_SIZE);
    expect(s.cycleStage).toEqual(DEFAULT_STAGE_SIZE);
    expect(s.reviewSpeed).toBe(DEFAULT_REVIEW_SPEED);
    // Legacy montagereview opens fitted (`fit=1`).
    expect(s.reviewFit).toBe(true);
  });

  it('persists every view preference the legacy cookies held', () => {
    const s = useMontageStore.getState();
    s.setStatusPosition('hover');
    s.setShowZones(true);
    s.setClassicLayoutId('saved:12');
    s.setCycleStage({ width: '640px', height: 'auto', scale: '0' });
    s.setReviewSpeed(4);
    s.setReviewFit(false);
    const raw = JSON.parse(window.localStorage.getItem('zm-montage') ?? '{}');
    expect(raw.state).toMatchObject({
      statusPosition: 'hover', showZones: true, classicLayoutId: 'saved:12',
      cycleStage: { width: '640px' }, reviewSpeed: 4, reviewFit: false,
    });
  });
});
