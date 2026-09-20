import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { zoomAt, clampPan, usePinchZoom, PINCH_MAX, PINCH_MIN, PINCH_STEP } from './usePinchZoom';

const at = (scale: number, x = 0, y = 0) => ({ scale, x, y });

describe('zoomAt', () => {
  it('keeps the point under the gesture where it was', () => {
    // Zooming 2× centred 100px right of centre: that point must not move.
    const next = zoomAt(at(1), 2, 100, 0);
    const before = 100; // distance of the point from the origin, unscaled
    const after = before * next.scale + next.x;
    expect(after).toBeCloseTo(100, 6);
  });

  it('snaps back to the identity transform at 1×', () => {
    expect(zoomAt(at(2, 40, -20), 1, 10, 10)).toEqual({ scale: 1, x: 0, y: 0 });
    // …and cannot be pushed below it.
    expect(zoomAt(at(2, 40, -20), 0.2, 10, 10)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('clamps to the zoom range', () => {
    expect(zoomAt(at(4), 99, 0, 0).scale).toBe(PINCH_MAX);
    expect(zoomAt(at(1), PINCH_MIN, 0, 0).scale).toBe(PINCH_MIN);
  });

  it('composes: two pinches to 2× match one to 4×', () => {
    const once = zoomAt(at(1), 4, 30, 12);
    const twice = zoomAt(zoomAt(at(1), 2, 30, 12), 4, 30, 12);
    expect(twice.scale).toBe(once.scale);
    expect(twice.x).toBeCloseTo(once.x, 6);
    expect(twice.y).toBeCloseTo(once.y, 6);
  });
});

describe('clampPan', () => {
  it('does not move anything at 1×', () => {
    expect(clampPan(at(1, 500, 500), 800, 450)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('stops the content being dragged off the frame', () => {
    const panned = clampPan(at(2, 5000, -5000), 800, 450);
    expect(panned.x).toBeLessThanOrEqual(800);
    expect(panned.y).toBeGreaterThanOrEqual(-450);
    expect(panned.scale).toBe(2);
  });

  it('leaves a pan inside the slack alone', () => {
    expect(clampPan(at(2, 20, -10), 800, 450)).toEqual({ scale: 2, x: 20, y: -10 });
  });
});

describe('usePinchZoom — buttons and click-to-zoom', () => {
  /** A mounted div wired to the hook, with a real box for the maths. */
  function mount(clickToZoom: boolean) {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100, x: 0, y: 0,
      toJSON: () => ({}),
    });
    document.body.appendChild(el);
    const hook = renderHook(() => usePinchZoom<HTMLDivElement>(true, clickToZoom));
    act(() => hook.result.current.ref(el));
    return { el, hook };
  }

  it('steps in and out about the centre and stops at 1×', () => {
    const { hook } = mount(false);

    act(() => hook.result.current.zoomIn());
    expect(hook.result.current.scale).toBeCloseTo(PINCH_STEP, 6);
    expect(hook.result.current.zoomed).toBe(true);

    act(() => hook.result.current.zoomOut());
    expect(hook.result.current.scale).toBe(PINCH_MIN);
    expect(hook.result.current.zoomed).toBe(false);

    act(() => hook.result.current.zoomOut());
    expect(hook.result.current.scale).toBe(PINCH_MIN);
  });

  it('zooms towards a click only when click-to-zoom is on', () => {
    const off = mount(false);
    act(() => { off.el.dispatchEvent(new MouseEvent('click', { clientX: 150, clientY: 50, bubbles: true })); });
    expect(off.hook.result.current.scale).toBe(PINCH_MIN);

    const on = mount(true);
    act(() => { on.el.dispatchEvent(new MouseEvent('click', { clientX: 150, clientY: 50, bubbles: true })); });
    expect(on.hook.result.current.scale).toBeCloseTo(PINCH_STEP, 6);
    // Clicked right of centre, so the picture shifts left to bring it in.
    const shift = /translate\((-?[\d.]+)px/.exec(String(on.hook.result.current.style.transform));
    expect(Number(shift![1])).toBeLessThan(0);
  });
});
