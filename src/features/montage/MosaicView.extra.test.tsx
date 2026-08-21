/**
 * MosaicView — the interactive half: the draggable Divider between two
 * siblings in a split, and the per-cell drag-and-drop that rearranges the
 * layout tree. Both are pure pointer/drag plumbing, so jsdom needs a hand:
 * elements report a zero-sized `getBoundingClientRect()` and there is no
 * `DataTransfer`, both of which the maths depends on.
 */
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { MosaicView } from './MosaicView';
import { leaf, leafMonitors, nodeAt, split, type LayoutNode } from './mosaic';

const DRAG_MIME = 'application/x-mosaic-path';

/* ----- jsdom shims ------------------------------------------------------ */

type CaptureFn = (pointerId: number) => void;
const origSet = Element.prototype.setPointerCapture as CaptureFn | undefined;
const origRelease = Element.prototype.releasePointerCapture as CaptureFn | undefined;

beforeAll(() => {
  // jsdom either lacks pointer capture or rejects synthetic pointer ids.
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});
afterAll(() => {
  if (origSet) Element.prototype.setPointerCapture = origSet;
  else delete (Element.prototype as Partial<Element>).setPointerCapture;
  if (origRelease) Element.prototype.releasePointerCapture = origRelease;
  else delete (Element.prototype as Partial<Element>).releasePointerCapture;
});

/** Give one element a real box so the divider / drop-zone maths can run. */
function stubRect(el: Element, r: { left?: number; top?: number; width: number; height: number }) {
  const box = {
    x: r.left ?? 0, y: r.top ?? 0,
    left: r.left ?? 0, top: r.top ?? 0,
    width: r.width, height: r.height,
    right: (r.left ?? 0) + r.width, bottom: (r.top ?? 0) + r.height,
    toJSON: () => ({}),
  } as DOMRect;
  Object.defineProperty(el, 'getBoundingClientRect', { value: () => box, configurable: true });
}

/**
 * jsdom has no PointerEvent/DragEvent constructor that carries clientX,
 * clientY and dataTransfer, so build a bubbling Event and hang the fields
 * React's synthetic layer reads off it.
 */
function raw(type: string, props: Record<string, unknown>): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, { pointerId: 1, ...props });
  return ev;
}

function fakeDataTransfer(payload?: string) {
  const store = new Map<string, string>();
  if (payload != null) store.set(DRAG_MIME, payload);
  return {
    get types() { return [...store.keys()]; },
    effectAllowed: '',
    dropEffect: '',
    setData: (k: string, v: string) => { store.set(k, v); },
    getData: (k: string) => store.get(k) ?? '',
  };
}

/* ----- Render helpers --------------------------------------------------- */

function mount(tree: LayoutNode, onChange = vi.fn()) {
  const { container } = renderWithProviders(
    <MosaicView
      tree={tree}
      onChange={onChange}
      renderCell={(id) => <div>{id == null ? 'vacant' : `cam ${id}`}</div>}
      onSplit={() => {}}
      onClose={() => {}}
    />,
  );
  // <div dir="ltr"> → the split's flex container → [slot, divider, slot, …].
  const splitEl = container.firstElementChild!.firstElementChild!;
  return { container, onChange, splitEl };
}

/** The dividers of a split element, in order (they sit between the slots). */
function dividersOf(splitEl: Element): Element[] {
  return [...splitEl.children].filter((_, i) => i % 2 === 1);
}

/** A cell's root element, reached from its drag handle. */
function cellOf(index: number): HTMLElement {
  return screen.getAllByLabelText('Drag tile')[index].parentElement as HTMLElement;
}

/* ======================================================================== */
/*  Divider                                                                 */
/* ======================================================================== */

describe('MosaicView — divider drag', () => {
  it('renders one divider between each adjacent pair of siblings', () => {
    const { splitEl } = mount(split('row', [leaf(1), leaf(2), leaf(3)]));
    expect(splitEl.children).toHaveLength(5); // slot, div, slot, div, slot
    expect(dividersOf(splitEl)).toHaveLength(2);
  });

  it('transfers share between the two siblings it sits between', () => {
    const onChange = vi.fn();
    const { splitEl } = mount(split('row', [leaf(1), leaf(2)], [0.5, 0.5]), onChange);
    stubRect(splitEl, { left: 0, top: 0, width: 1000, height: 500 });
    const divider = dividersOf(splitEl)[0];

    fireEvent(divider, raw('pointerdown', { clientX: 500, clientY: 250 }));
    fireEvent(divider, raw('pointermove', { clientX: 700, clientY: 250 }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as LayoutNode;
    expect(next.type).toBe('split');
    expect((next as { sizes: number[] }).sizes[0]).toBeCloseTo(0.7, 5);
    expect((next as { sizes: number[] }).sizes[1]).toBeCloseTo(0.3, 5);
  });

  it('clamps so neither sibling collapses below a 5% share', () => {
    const onChange = vi.fn();
    const { splitEl } = mount(split('row', [leaf(1), leaf(2)], [0.5, 0.5]), onChange);
    stubRect(splitEl, { left: 0, top: 0, width: 1000, height: 500 });
    const divider = dividersOf(splitEl)[0];

    fireEvent(divider, raw('pointerdown', { clientX: 500, clientY: 250 }));
    fireEvent(divider, raw('pointermove', { clientX: 9999, clientY: 250 }));

    const wide = onChange.mock.calls[0][0] as { sizes: number[] };
    expect(wide.sizes[0]).toBeCloseTo(0.95, 5);
    expect(wide.sizes[1]).toBeCloseTo(0.05, 5);

    onChange.mockClear();
    fireEvent(divider, raw('pointermove', { clientX: -9999, clientY: 250 }));
    const narrow = onChange.mock.calls[0][0] as { sizes: number[] };
    expect(narrow.sizes[0]).toBeCloseTo(0.05, 5);
    expect(narrow.sizes[1]).toBeCloseTo(0.95, 5);
  });

  it('leaves the untouched siblings of a three-way split alone', () => {
    const onChange = vi.fn();
    const { splitEl } = mount(
      split('row', [leaf(1), leaf(2), leaf(3)], [0.4, 0.4, 0.2]),
      onChange,
    );
    stubRect(splitEl, { left: 0, top: 0, width: 1000, height: 500 });
    // Second divider: the boundary between children 1 and 2.
    const divider = dividersOf(splitEl)[1];

    fireEvent(divider, raw('pointerdown', { clientX: 800, clientY: 250 }));
    fireEvent(divider, raw('pointermove', { clientX: 900, clientY: 250 }));

    const sizes = (onChange.mock.calls[0][0] as { sizes: number[] }).sizes;
    expect(sizes[0]).toBeCloseTo(0.4, 5); // untouched
    expect(sizes[1]).toBeCloseTo(0.5, 5);
    expect(sizes[2]).toBeCloseTo(0.1, 5);
  });

  it('measures a column split against its height and the pointer Y', () => {
    const onChange = vi.fn();
    const { splitEl } = mount(split('column', [leaf(1), leaf(2)], [0.5, 0.5]), onChange);
    stubRect(splitEl, { left: 0, top: 100, width: 1000, height: 400 });
    const divider = dividersOf(splitEl)[0];

    fireEvent(divider, raw('pointerdown', { clientX: 500, clientY: 300 }));
    // 400px tall starting at y=100; y=200 is a quarter of the way down.
    fireEvent(divider, raw('pointermove', { clientX: 500, clientY: 200 }));

    const sizes = (onChange.mock.calls[0][0] as { sizes: number[] }).sizes;
    expect(sizes[0]).toBeCloseTo(0.25, 5);
    expect(sizes[1]).toBeCloseTo(0.75, 5);
  });

  it('ignores a move with no drag in progress, and stops on pointer up', () => {
    const onChange = vi.fn();
    const { splitEl } = mount(split('row', [leaf(1), leaf(2)]), onChange);
    stubRect(splitEl, { left: 0, top: 0, width: 1000, height: 500 });
    const divider = dividersOf(splitEl)[0];

    fireEvent(divider, raw('pointermove', { clientX: 700, clientY: 250 }));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent(divider, raw('pointerdown', { clientX: 500, clientY: 250 }));
    fireEvent(divider, raw('pointerup', { clientX: 700, clientY: 250 }));
    fireEvent(divider, raw('pointermove', { clientX: 700, clientY: 250 }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cancelling the pointer ends the drag too', () => {
    const onChange = vi.fn();
    const { splitEl } = mount(split('row', [leaf(1), leaf(2)]), onChange);
    stubRect(splitEl, { left: 0, top: 0, width: 1000, height: 500 });
    const divider = dividersOf(splitEl)[0];

    fireEvent(divider, raw('pointerdown', { clientX: 500, clientY: 250 }));
    fireEvent(divider, raw('pointercancel', { clientX: 500, clientY: 250 }));
    fireEvent(divider, raw('pointermove', { clientX: 700, clientY: 250 }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does nothing while the split has no measurable size', () => {
    const onChange = vi.fn();
    const { splitEl } = mount(split('row', [leaf(1), leaf(2)]), onChange);
    // No stubRect: jsdom reports a 0×0 box, so there is nothing to divide.
    const divider = dividersOf(splitEl)[0];
    fireEvent(divider, raw('pointerdown', { clientX: 500, clientY: 250 }));
    fireEvent(divider, raw('pointermove', { clientX: 700, clientY: 250 }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

/* ======================================================================== */
/*  Cell drag-and-drop                                                      */
/* ======================================================================== */

describe('MosaicView — cell drag and drop', () => {
  it('puts a drag handle on occupied cells only, and it carries the cell path', () => {
    mount(split('row', [leaf(1), leaf(null)]));
    const handles = screen.getAllByLabelText('Drag tile');
    expect(handles).toHaveLength(1);

    const dt = fakeDataTransfer();
    fireEvent(handles[0], raw('dragstart', { dataTransfer: dt }));
    expect(dt.getData(DRAG_MIME)).toBe('[0]');
    expect(dt.effectAllowed).toBe('move');
  });

  it('shows a drop-zone overlay on drag over and clears it on leave', () => {
    mount(split('row', [leaf(1), leaf(2)]));
    const target = cellOf(1);
    stubRect(target, { left: 0, top: 0, width: 200, height: 200 });
    const before = target.childElementCount;

    fireEvent(target, raw('dragover', {
      dataTransfer: fakeDataTransfer('[0]'), clientX: 10, clientY: 100,
    }));
    expect(target.childElementCount).toBe(before + 1);

    // Leaving for a child of the same cell keeps the overlay up.
    fireEvent(target, raw('dragleave', { relatedTarget: target.firstElementChild }));
    expect(target.childElementCount).toBe(before + 1);

    // Leaving the cell entirely clears it.
    fireEvent(target, raw('dragleave', { relatedTarget: null }));
    expect(target.childElementCount).toBe(before);
  });

  it('ignores a drag that is not carrying a mosaic tile', () => {
    mount(split('row', [leaf(1), leaf(2)]));
    const target = cellOf(1);
    stubRect(target, { left: 0, top: 0, width: 200, height: 200 });
    const before = target.childElementCount;

    fireEvent(target, raw('dragover', {
      dataTransfer: fakeDataTransfer(), clientX: 10, clientY: 100,
    }));
    expect(target.childElementCount).toBe(before);
  });

  it('dropping on the middle of a cell swaps the two monitors', () => {
    const onChange = vi.fn();
    mount(split('row', [leaf(1), leaf(2)]), onChange);
    const target = cellOf(1);
    stubRect(target, { left: 0, top: 0, width: 200, height: 200 });

    fireEvent(target, raw('drop', {
      dataTransfer: fakeDataTransfer('[0]'), clientX: 100, clientY: 100,
    }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(leafMonitors(onChange.mock.calls[0][0] as LayoutNode)).toEqual([2, 1]);
  });

  it.each([
    ['right',  { clientX: 190, clientY: 100 }, 'row' as const,    [null, 2, 1]],
    ['left',   { clientX: 10,  clientY: 100 }, 'row' as const,    [null, 1, 2]],
    ['bottom', { clientX: 100, clientY: 190 }, 'column' as const, [null, 2, 1]],
    ['top',    { clientX: 100, clientY: 10 },  'column' as const, [null, 1, 2]],
  ])('dropping on the %s edge splits the target cell', (_zone, at, direction, expected) => {
    const onChange = vi.fn();
    mount(split('row', [leaf(1), leaf(2)]), onChange);
    const target = cellOf(1);
    stubRect(target, { left: 0, top: 0, width: 200, height: 200 });

    fireEvent(target, raw('drop', { dataTransfer: fakeDataTransfer('[0]'), ...at }));

    const next = onChange.mock.calls[0][0] as LayoutNode;
    expect(leafMonitors(next)).toEqual(expected);
    expect(nodeAt(next, [1])).toMatchObject({ type: 'split', direction });
  });

  it('ignores a drop with no tile payload', () => {
    const onChange = vi.fn();
    mount(split('row', [leaf(1), leaf(2)]), onChange);
    const target = cellOf(1);
    stubRect(target, { left: 0, top: 0, width: 200, height: 200 });

    fireEvent(target, raw('drop', {
      dataTransfer: fakeDataTransfer(), clientX: 100, clientY: 100,
    }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('dropping a tile back onto itself changes nothing', () => {
    const onChange = vi.fn();
    const tree = split('row', [leaf(1), leaf(2)]);
    mount(tree, onChange);
    const target = cellOf(0);
    stubRect(target, { left: 0, top: 0, width: 200, height: 200 });

    fireEvent(target, raw('drop', {
      dataTransfer: fakeDataTransfer('[0]'), clientX: 100, clientY: 100,
    }));
    expect(onChange).toHaveBeenCalledWith(tree);
  });
});
