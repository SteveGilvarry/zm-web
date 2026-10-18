/**
 * Per-tile zoom and pan, after legacy's panzoom gestures on montage and
 * cycle tiles.
 */
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { TILE_VIEW_RESET, TILE_ZOOM_MAX, clampPan, useTileZoom, zoomAbout } from './tileZoom';

describe('clampPan', () => {
  it('keeps the scaled picture over the frame', () => {
    // 2x on a 200x100 frame overhangs by 100 / 50 each side.
    expect(clampPan({ zoom: 2, x: 500, y: -500 }, 200, 100)).toEqual({ zoom: 2, x: 100, y: -50 });
    expect(clampPan({ zoom: 2, x: 20, y: 10 }, 200, 100)).toEqual({ zoom: 2, x: 20, y: 10 });
  });
  it('recentres at zoom 1', () => {
    expect(clampPan({ zoom: 1, x: 30, y: 30 }, 200, 100)).toEqual(TILE_VIEW_RESET);
  });
});

describe('zoomAbout', () => {
  it('keeps the point under the pointer where it was', () => {
    const v = zoomAbout(TILE_VIEW_RESET, 2, 50, 0, 200, 100);
    expect(v.zoom).toBe(2);
    // A point 50 px right of centre stays 50 px right of centre:
    // x + zoom * local = 50, local = 50 → x = -50.
    expect(v.x).toBe(-50);
    expect(v.y).toBe(0);
  });
  it('stops at 1 and at the maximum', () => {
    expect(zoomAbout(TILE_VIEW_RESET, 0.5, 0, 0, 200, 100)).toBe(TILE_VIEW_RESET);
    const max = { zoom: TILE_ZOOM_MAX, x: 0, y: 0 };
    expect(zoomAbout(max, 2, 0, 0, 200, 100)).toBe(max);
  });
});

function pointer(over: Partial<{ shiftKey: boolean; ctrlKey: boolean; clientX: number; clientY: number; target: Element }> = {}) {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
  return {
    shiftKey: false, ctrlKey: false, clientX: 100, clientY: 50, pointerId: 1,
    target: el, currentTarget: el, ...over,
  } as unknown as PointerEvent<HTMLElement>;
}

describe('useTileZoom gestures', () => {
  it('Shift+click zooms in, Ctrl+click zooms out, Ctrl+Shift+click resets', () => {
    const { result } = renderHook(() => useTileZoom());
    act(() => result.current.gestures.onPointerDown(pointer({ shiftKey: true })));
    expect(result.current.zoom).toBeCloseTo(1.3);
    act(() => result.current.gestures.onPointerDown(pointer({ shiftKey: true })));
    act(() => result.current.gestures.onPointerDown(pointer({ ctrlKey: true })));
    expect(result.current.zoom).toBeCloseTo(1.3);
    act(() => result.current.gestures.onPointerDown(pointer({ ctrlKey: true, shiftKey: true })));
    expect(result.current.zoom).toBe(1);
    expect(result.current.style).toBeUndefined();
  });

  it('drags a zoomed picture, within its edges', () => {
    const { result } = renderHook(() => useTileZoom());
    act(() => result.current.gestures.onPointerDown(pointer({ shiftKey: true })));
    act(() => result.current.gestures.onPointerDown(pointer({ shiftKey: true }))); // 1.69x
    act(() => result.current.gestures.onPointerDown(pointer({ clientX: 100, clientY: 50 })));
    act(() => result.current.gestures.onPointerMove(pointer({ clientX: 120, clientY: 60 })));
    expect(result.current.style?.transform).toBe(`translate(20px, 10px) scale(${1.3 * 1.3})`);
    // Far past the edge: 0.69 * 200 / 2 = 69 px at most.
    act(() => result.current.gestures.onPointerMove(pointer({ clientX: 900, clientY: 50 })));
    expect(result.current.style?.transform).toMatch(/^translate\(69(\.\d+)?px, 0px\)/);
    act(() => result.current.gestures.onPointerUp(pointer()));
    act(() => result.current.gestures.onPointerMove(pointer({ clientX: 0, clientY: 0 })));
    expect(result.current.style?.transform).toMatch(/^translate\(69(\.\d+)?px, 0px\)/);
  });

  it('a plain press at zoom 1 does nothing, and the tile buttons keep their clicks', () => {
    const { result } = renderHook(() => useTileZoom());
    act(() => result.current.gestures.onPointerDown(pointer()));
    act(() => result.current.gestures.onPointerMove(pointer({ clientX: 150 })));
    expect(result.current.style).toBeUndefined();
    const button = document.createElement('button');
    act(() => result.current.gestures.onPointerDown(pointer({ shiftKey: true, target: button })));
    expect(result.current.zoom).toBe(1);
  });

  it('carries legacy\'s tooltip', () => {
    const { result } = renderHook(() => useTileZoom());
    expect(result.current.gestures.title).toMatch(/^Shift\+Click to Zoom, Click\+Drag to Pan/);
  });
});
