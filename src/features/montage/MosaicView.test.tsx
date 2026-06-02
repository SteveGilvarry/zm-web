import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { MosaicView } from './MosaicView';
import { leaf, split, type LayoutNode } from './mosaic';

describe('MosaicView — rendering', () => {
  it('calls renderCell once per leaf with the leaf monitorId + path', () => {
    const tree: LayoutNode = split('row', [leaf(1), leaf(2)]);
    const renderCell = vi.fn().mockReturnValue(<div>cell</div>);
    renderWithProviders(
      <MosaicView
        tree={tree}
        onChange={() => {}}
        renderCell={renderCell}
        onSplit={() => {}}
        onClose={() => {}}
      />,
    );
    expect(renderCell).toHaveBeenCalledTimes(2);
    expect(renderCell).toHaveBeenCalledWith(1, [0]);
    expect(renderCell).toHaveBeenCalledWith(2, [1]);
  });

  it('shows a "Choose monitor" affordance on a vacant leaf when handler provided', () => {
    const tree: LayoutNode = leaf(null);
    renderWithProviders(
      <MosaicView
        tree={tree}
        onChange={() => {}}
        renderCell={() => null}
        onSplit={() => {}}
        onClose={() => {}}
        onChooseMonitor={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /choose monitor/i })).toBeInTheDocument();
  });

  it('does not show the picker affordance when no handler is provided', () => {
    const tree: LayoutNode = leaf(null);
    renderWithProviders(
      <MosaicView
        tree={tree}
        onChange={() => {}}
        renderCell={() => null}
        onSplit={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /choose monitor/i })).toBeNull();
  });
});

describe('MosaicView — split + close controls', () => {
  it('clicking the split-horizontal button calls onSplit with row + path', async () => {
    const user = userEvent.setup();
    const onSplit = vi.fn();
    const tree: LayoutNode = leaf(1);

    renderWithProviders(
      <MosaicView
        tree={tree}
        onChange={() => {}}
        renderCell={() => <div>cell</div>}
        onSplit={onSplit}
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: /split horizontally/i }));
    expect(onSplit).toHaveBeenCalledWith([], 'row');
  });

  it('clicking the split-vertical button calls onSplit with column', async () => {
    const user = userEvent.setup();
    const onSplit = vi.fn();
    const tree: LayoutNode = leaf(1);

    renderWithProviders(
      <MosaicView
        tree={tree}
        onChange={() => {}}
        renderCell={() => <div>cell</div>}
        onSplit={onSplit}
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: /split vertically/i }));
    expect(onSplit).toHaveBeenCalledWith([], 'column');
  });

  it('clicking the remove button calls onClose with the cell path', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const tree: LayoutNode = split('row', [leaf(1), leaf(2)]);

    renderWithProviders(
      <MosaicView
        tree={tree}
        onChange={() => {}}
        renderCell={() => <div>cell</div>}
        onSplit={() => {}}
        onClose={onClose}
      />,
    );

    // Two cells, two remove buttons; click the second.
    const removeBtns = screen.getAllByRole('button', { name: /remove tile/i });
    expect(removeBtns).toHaveLength(2);
    await user.click(removeBtns[1]);
    expect(onClose).toHaveBeenCalledWith([1]);
  });
});

describe('MosaicView — choose-monitor handler', () => {
  it('clicking a vacant cell calls onChooseMonitor with its path', async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    const tree: LayoutNode = split('row', [leaf(1), leaf(null)]);

    renderWithProviders(
      <MosaicView
        tree={tree}
        onChange={() => {}}
        renderCell={() => null}
        onSplit={() => {}}
        onClose={() => {}}
        onChooseMonitor={onChoose}
      />,
    );

    await user.click(screen.getByRole('button', { name: /choose monitor/i }));
    expect(onChoose).toHaveBeenCalledWith([1]);
  });
});
