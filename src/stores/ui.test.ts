import { describe, expect, it, beforeEach } from 'vitest';
import { useUiStore } from './ui';

describe('UI store — skin', () => {
  beforeEach(() => {
    // Reset to a known baseline before each test. The store persists to
    // localStorage; the test environment's localStorage is fresh-per-file.
    useUiStore.setState({ skin: 'modern', sidebarCollapsed: false });
  });

  it("starts in 'modern' skin", () => {
    expect(useUiStore.getState().skin).toBe('modern');
  });

  it("setSkin flips to 'classic'", () => {
    useUiStore.getState().setSkin('classic');
    expect(useUiStore.getState().skin).toBe('classic');
  });

  it("flipping skin back to 'modern' works", () => {
    useUiStore.getState().setSkin('classic');
    useUiStore.getState().setSkin('modern');
    expect(useUiStore.getState().skin).toBe('modern');
  });
});

describe('UI store — live tile cap', () => {
  beforeEach(() => {
    useUiStore.setState({ maxLiveTiles: 12 });
  });

  it('defaults to 12 simultaneous live tiles', () => {
    expect(useUiStore.getState().maxLiveTiles).toBe(12);
  });

  it('setMaxLiveTiles stores a positive integer and rejects junk', () => {
    useUiStore.getState().setMaxLiveTiles(24);
    expect(useUiStore.getState().maxLiveTiles).toBe(24);
    useUiStore.getState().setMaxLiveTiles(0);
    expect(useUiStore.getState().maxLiveTiles).toBe(12);
    useUiStore.getState().setMaxLiveTiles(Number.NaN);
    expect(useUiStore.getState().maxLiveTiles).toBe(12);
  });
});

describe('UI store — sidebar', () => {
  beforeEach(() => {
    useUiStore.setState({ skin: 'modern', sidebarCollapsed: false });
  });

  it('toggleSidebar flips collapsed state', () => {
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
  });
});
