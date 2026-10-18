import { describe, expect, it } from 'vitest';
import { DEFAULT_STAGE_SIZE } from '@/features/monitors/watchStage';
import { DEFAULT_REVIEW_SPEED, useMontageStore, useReviewRangeStore } from './montage';
import { DEFAULT_REVIEW_FILTERS } from '@/features/montagereview/useReviewEvents';

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

describe('Montage Review filters in the store', () => {
  it('starts with nothing chosen', () => {
    useMontageStore.setState({ reviewFilters: DEFAULT_REVIEW_FILTERS });
    expect(useMontageStore.getState().reviewFilters).toEqual({ archived: 'all', tagIds: [], notes: [] });
  });

  it('reads an older or damaged stored shape field by field', async () => {
    window.localStorage.setItem('zm-montage', JSON.stringify({
      state: { reviewSpeed: 2, reviewFilters: { archived: 'bogus', tagIds: [3, 'x', -1], notes: 'Motion' } },
      version: 0,
    }));
    await useMontageStore.persist.rehydrate();
    expect(useMontageStore.getState().reviewSpeed).toBe(2);
    expect(useMontageStore.getState().reviewFilters).toEqual({ archived: 'all', tagIds: [3, -1], notes: ['Motion'] });

    window.localStorage.setItem('zm-montage', JSON.stringify({ state: {}, version: 0 }));
    await useMontageStore.persist.rehydrate();
    expect(useMontageStore.getState().reviewFilters).toEqual(DEFAULT_REVIEW_FILTERS);
  });
});

describe('useReviewRangeStore', () => {
  it('keeps the window in sessionStorage, not localStorage', () => {
    useReviewRangeStore.getState().setRange({ start: '2026-08-21T00:00:00.000Z', end: '2026-08-21T01:00:00.000Z' });
    expect(JSON.parse(window.sessionStorage.getItem('zm-review-range') ?? '{}').state.range)
      .toEqual({ start: '2026-08-21T00:00:00.000Z', end: '2026-08-21T01:00:00.000Z' });
    expect(window.localStorage.getItem('zm-review-range')).toBeNull();
    useReviewRangeStore.getState().setRange(null);
  });
});
