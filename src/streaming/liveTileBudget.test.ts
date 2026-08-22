import { describe, expect, it, beforeEach, vi } from 'vitest';
import { liveTileBudget } from './liveTileBudget';

beforeEach(() => liveTileBudget.reset());

describe('liveTileBudget', () => {
  it('grants slots up to the limit and refuses beyond it', () => {
    liveTileBudget.setLiveTileLimit(2);
    expect(liveTileBudget.request('a')).toBe(true);
    expect(liveTileBudget.request('b')).toBe(true);
    expect(liveTileBudget.request('c')).toBe(false);
    expect(liveTileBudget.snapshot()).toEqual({ used: 2, limit: 2 });
  });

  it('is idempotent for a key that already holds a slot', () => {
    liveTileBudget.setLiveTileLimit(1);
    expect(liveTileBudget.request('a')).toBe(true);
    expect(liveTileBudget.request('a')).toBe(true);
    expect(liveTileBudget.snapshot().used).toBe(1);
  });

  it('release frees the slot and notifies subscribers so a waiter can retry', () => {
    liveTileBudget.setLiveTileLimit(1);
    liveTileBudget.request('a');
    const listener = vi.fn();
    const unsub = liveTileBudget.subscribe(listener);
    expect(liveTileBudget.request('b')).toBe(false);
    liveTileBudget.release('a');
    expect(listener).toHaveBeenCalled();
    expect(liveTileBudget.request('b')).toBe(true);
    unsub();
  });

  it('lowering the limit evicts the most recently granted holders first', () => {
    liveTileBudget.setLiveTileLimit(3);
    liveTileBudget.request('old');
    liveTileBudget.request('mid');
    liveTileBudget.request('new');
    liveTileBudget.setLiveTileLimit(1);
    expect(liveTileBudget.hasSlot('old')).toBe(true);
    expect(liveTileBudget.hasSlot('mid')).toBe(false);
    expect(liveTileBudget.hasSlot('new')).toBe(false);
  });

  it('falls back to the default for a nonsense limit', () => {
    liveTileBudget.setLiveTileLimit(0);
    expect(liveTileBudget.snapshot().limit).toBe(12);
  });

  it('bumps the version on every mutation', () => {
    const v0 = liveTileBudget.getVersion();
    liveTileBudget.request('a');
    expect(liveTileBudget.getVersion()).toBeGreaterThan(v0);
  });
});
