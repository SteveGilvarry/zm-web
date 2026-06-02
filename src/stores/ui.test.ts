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
