import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import type { Monitor } from '@/types';
import { autoColumns, MONTAGE_PRESETS } from './classicPresets';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children, to,
    ...rest
  }: { children: React.ReactNode; to?: string; [k: string]: unknown }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
}));

// StreamCell pulls in the streaming hooks; replace with a sentinel that
// records its props so the test stays scoped to the grid + toolbar.
const streamCellProps: Array<Record<string, unknown>> = [];
vi.mock('@/components/common/StreamCell', () => ({
  StreamCell: (props: { monitorId: number }) => {
    streamCellProps.push(props);
    return <div data-testid={`stream-${props.monitorId}`} />;
  },
}));

// TileControls asks for monitor-edit rights; grant them without a query client.
vi.mock('@/features/auth/usePerms', () => ({
  usePerms: () => ({ can: () => true, level: () => 'Edit', known: true, perms: {} }),
}));

// Runtime status comes from a polled query; stub the hook with fixed rows.
vi.mock('@/features/monitors/useMonitorStatuses', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/monitors/useMonitorStatuses')>()),
  useMonitorStatuses: () => ({
    byId: {
      1: { monitorId: 1, status: 'Connected', captureFps: 10.89, analysisFps: 0, bandwidth: 1000, updatedOn: '' },
    },
    list: [],
    isLoading: false,
    isError: false,
  }),
}));

const { MontageClassicGrid } = await import('./MontageClassicGrid');

function makeMonitor(over: Partial<Monitor> = {}): Monitor {
  return {
    id: 1,
    name: 'Front Door',
    width: 1920,
    height: 1080,
    orientation: 'Rotate0',
    capturing: 'Always',
    analysing: 'Always',
    recording: 'OnMotion',
    host: '192.168.1.10',
    type: 'Ffmpeg',
    ...over,
  } as unknown as Monitor;
}

describe('autoColumns — legacy montage.php heuristic', () => {
  it('returns the monitor count for <=3 monitors', () => {
    expect(autoColumns(1)).toBe(1);
    expect(autoColumns(2)).toBe(2);
    expect(autoColumns(3)).toBe(3);
  });

  it('returns 2 for 4 monitors', () => {
    expect(autoColumns(4)).toBe(2);
  });

  it('returns 3 for 5 or 6 monitors', () => {
    expect(autoColumns(5)).toBe(3);
    expect(autoColumns(6)).toBe(3);
  });

  it('returns 4 for counts divisible by 4 (and not <=6)', () => {
    expect(autoColumns(8)).toBe(4);
    expect(autoColumns(16)).toBe(4);
  });

  it('returns 6 for counts divisible by 6 but not 4 (and not <=6)', () => {
    // 18 / 4 = 4.5 (not), 18 / 6 = 3 — divisible.
    expect(autoColumns(18)).toBe(6);
  });

  it('falls back to 4 for everything else', () => {
    expect(autoColumns(7)).toBe(4);
    expect(autoColumns(11)).toBe(4);
  });
});

describe('MontageClassicGrid — preset list', () => {
  it('exposes Auto + every "N Wide" preset the legacy spec requires', () => {
    const labels = MONTAGE_PRESETS.map((p) => p.label);
    expect(labels).toEqual([
      'Auto', '1 Wide', '2 Wide', '3 Wide', '4 Wide', '5 Wide', '6 Wide',
      '8 Wide', '12 Wide', '16 Wide', '20 Wide', '24 Wide', '32 Wide', '48 Wide',
    ]);
  });
});

describe('MontageClassicGrid — live cells', () => {
  it('renders a gated, auto-starting StreamCell per monitor on the given protocol', () => {
    streamCellProps.length = 0;
    render(<MontageClassicGrid monitors={[makeMonitor({ id: 1 }), makeMonitor({ id: 2 })]} columns={2} protocol="webrtc" />);
    expect(screen.getByTestId('stream-1')).toBeInTheDocument();
    expect(screen.getByTestId('stream-2')).toBeInTheDocument();
    expect(streamCellProps[0]).toMatchObject({ protocol: 'webrtc', autoStart: true, gated: true, compact: true });
  });

  it('captions each cell with runtime state + capture fps when known, id otherwise', () => {
    render(<MontageClassicGrid monitors={[makeMonitor({ id: 1 }), makeMonitor({ id: 2 })]} columns={2} protocol="webrtc" />);
    expect(screen.getByTestId('montage-classic-status-1')).toHaveTextContent('Connected · 10.9 fps');
    expect(screen.getByTestId('montage-classic-status-2')).toHaveTextContent('#2');
  });

  it('moves the caption inside the picture (or drops it) per the status position', () => {
    streamCellProps.length = 0;
    const { rerender } = render(
      <MontageClassicGrid monitors={[makeMonitor({ id: 1 })]} columns={1} protocol="hls" statusPosition="inside" />,
    );
    expect(screen.queryByTestId('montage-classic-status-1')).toBeNull();
    expect(streamCellProps.at(-1)).toMatchObject({ protocol: 'hls', showName: true, statusText: 'Connected · 10.9 fps' });
    rerender(<MontageClassicGrid monitors={[makeMonitor({ id: 1 })]} columns={1} protocol="hls" statusPosition="hidden" />);
    expect(screen.queryByTestId('montage-classic-status-1')).toBeNull();
    expect(streamCellProps.at(-1)).toMatchObject({ showName: false });
  });

  it('draws the legacy showOnHover caption inside the picture, revealed on hover', () => {
    render(
      <MontageClassicGrid monitors={[makeMonitor({ id: 1 })]} columns={1} protocol="hls" statusPosition="hover" />,
    );
    const caption = screen.getByTestId('montage-classic-hover-1');
    expect(caption).toHaveTextContent('Front Door');
    expect(caption).toHaveTextContent('Connected · 10.9 fps');
    expect(caption.className).toContain('group-hover:opacity-100');
    // Nothing outside the picture, and the stream's own caption stays off.
    expect(screen.queryByTestId('montage-classic-status-1')).toBeNull();
    expect(streamCellProps.at(-1)).toMatchObject({ showName: false });
  });
});

describe('MontageClassicGrid — rendering', () => {
  it('renders one cell per monitor with the monitor name visible', () => {
    render(
      <MontageClassicGrid
        columns={3}
        protocol="webrtc"
        monitors={[
          makeMonitor({ id: 1, name: 'Front Door' }),
          makeMonitor({ id: 2, name: 'Garage' }),
          makeMonitor({ id: 3, name: 'Driveway' }),
        ]}
      />,
    );
    expect(screen.getByText('Front Door')).toBeInTheDocument();
    expect(screen.getByText('Garage')).toBeInTheDocument();
    expect(screen.getByText('Driveway')).toBeInTheDocument();
    expect(screen.getByTestId('montage-classic-cell-1')).toBeInTheDocument();
    expect(screen.getByTestId('montage-classic-cell-2')).toBeInTheDocument();
    expect(screen.getByTestId('montage-classic-cell-3')).toBeInTheDocument();
  });

  it('renders the empty placeholder when no monitors are passed', () => {
    render(<MontageClassicGrid monitors={[]} columns={1} protocol="webrtc" />);
    expect(screen.getByTestId('montage-classic-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('montage-classic-grid')).toBeNull();
  });

  it('lays the grid out with the column count it is given', () => {
    render(<MontageClassicGrid monitors={[makeMonitor({ id: 1 }), makeMonitor({ id: 2 })]} columns={4} protocol="webrtc" />);
    expect(screen.getByTestId('montage-classic-grid').getAttribute('data-columns')).toBe('4');
  });

  it('applies the per-cell style from the Width / Height / Scale selects', () => {
    render(
      <MontageClassicGrid
        monitors={[makeMonitor({ id: 1 })]}
        columns={1}
        protocol="webrtc"
        cellStyle={() => ({ width: '320px', aspectRatio: '4 / 3' })}
      />,
    );
    expect(screen.getByTestId('montage-classic-cell-1')).toHaveStyle({ width: '320px' });
  });

  it('in Fit mode the frame fills the packed box instead of forcing 16:9', () => {
    // Legacy `maxfit2` hands each tile an absolute box; a fixed aspect on the
    // picture would leave the caption floating mid-tile above empty space.
    render(
      <MontageClassicGrid
        monitors={[makeMonitor({ id: 1 })]}
        columns={1}
        protocol="webrtc"
        fitHeight={600}
        cellStyle={() => ({ position: 'absolute', top: 0, width: 300, height: 520 })}
      />,
    );
    expect(screen.getByTestId('montage-classic-grid')).toHaveStyle({ height: '600px' });
    const frame = screen.getByTestId('montage-classic-cell-1').firstElementChild as HTMLElement;
    expect(frame.className).toContain('flex-1');
    expect(frame.style.aspectRatio).toBe('');
  });
});

describe('MontageClassicGrid — edit layout', () => {
  it('reports a drag-and-drop reorder as (from, to) ids in edit mode', () => {
    const onReorder = vi.fn();
    render(
      <MontageClassicGrid
        monitors={[makeMonitor({ id: 1 }), makeMonitor({ id: 2 })]}
        columns={2}
        protocol="webrtc"
        editMode
        onReorder={onReorder}
      />,
    );
    const a = screen.getByTestId('montage-classic-cell-1');
    const b = screen.getByTestId('montage-classic-cell-2');
    expect(a).toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(a, { dataTransfer: { effectAllowed: 'move' } });
    fireEvent.dragOver(b, { dataTransfer: { dropEffect: 'move' } });
    fireEvent.drop(b, { dataTransfer: {} });
    expect(onReorder).toHaveBeenCalledWith(1, 2);
  });

  it('is inert outside edit mode', () => {
    render(<MontageClassicGrid monitors={[makeMonitor({ id: 1 })]} columns={1} protocol="webrtc" />);
    expect(screen.getByTestId('montage-classic-cell-1')).not.toHaveAttribute('draggable');
  });
});

describe('MontageClassicGrid — tile controls', () => {
  it('offers zoom / fullscreen / watch per tile and scales the stream on zoom in', () => {
    render(<MontageClassicGrid monitors={[makeMonitor({ id: 1 })]} columns={1} protocol="webrtc" />);
    const controls = screen.getByTestId('tile-controls-1');
    const stream = screen.getByTestId('stream-1').parentElement!;
    expect(stream).not.toHaveStyle({ transform: 'scale(1.3)' });

    const zoomOut = within(controls).getByRole('button', { name: 'Zoom OUT' });
    expect(zoomOut).toBeDisabled(); // already at the natural fit
    fireEvent.click(within(controls).getByRole('button', { name: 'Zoom IN' }));
    expect(screen.getByTestId('stream-1').parentElement).toHaveStyle({ transform: 'scale(1.3)' });
    fireEvent.click(within(controls).getByRole('button', { name: 'Zoom OUT' }));
    expect(screen.getByTestId('stream-1').parentElement).not.toHaveStyle({ transform: 'scale(1.3)' });

    expect(within(controls).getByRole('button', { name: 'Open full screen' })).toBeInTheDocument();
    expect(within(controls).getByRole('link', { name: 'Open watch page' })).toBeInTheDocument();
    expect(within(controls).getByRole('link', { name: 'Edit monitor' })).toBeInTheDocument();
  });

  it('asks the browser to full-screen the tile frame', () => {
    const request = vi.fn().mockResolvedValue(undefined);
    render(<MontageClassicGrid monitors={[makeMonitor({ id: 1 })]} columns={1} protocol="webrtc" />);
    const frame = screen.getByTestId('stream-1').parentElement!.parentElement!;
    frame.requestFullscreen = request;
    fireEvent.click(within(screen.getByTestId('tile-controls-1')).getByRole('button', { name: 'Open full screen' }));
    expect(request).toHaveBeenCalled();
  });

  it('hides the controls while the layout is being edited', () => {
    render(<MontageClassicGrid monitors={[makeMonitor({ id: 1 })]} columns={1} protocol="webrtc" editMode />);
    expect(screen.queryByTestId('tile-controls-1')).not.toBeInTheDocument();
  });
});

/**
 * Legacy's per-tile `ratio<id>` select (only while editing the layout) and
 * WebSite monitors, which `Monitor::getStreamHTML` embeds rather than streams.
 */
describe('MontageClassicGrid — ratio and WebSite tiles', () => {
  it('offers a per-tile Ratio select while editing, and reports the choice', () => {
    const onRatioChange = vi.fn();
    render(
      <MontageClassicGrid
        monitors={[makeMonitor()]}
        columns={1}
        protocol="webrtc"
        editMode
        ratioFor={() => '16:9'}
        onRatioChange={onRatioChange}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Ratio for Front Door' });
    expect(select).toHaveValue('16:9');
    fireEvent.change(select, { target: { value: '4:3' } });
    expect(onRatioChange).toHaveBeenCalledWith(1, '4:3');
  });

  it('hides the per-tile Ratio select outside edit mode', () => {
    render(
      <MontageClassicGrid
        monitors={[makeMonitor()]}
        columns={1}
        protocol="webrtc"
        ratioFor={() => 'auto'}
        onRatioChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('combobox', { name: 'Ratio for Front Door' })).toBeNull();
  });

  it('embeds a WebSite monitor instead of streaming it', () => {
    render(
      <MontageClassicGrid
        monitors={[makeMonitor({ id: 5, name: 'Weather', type: 'WebSite', path: 'https://example.test/wx' })]}
        columns={1}
        protocol="webrtc"
      />,
    );
    expect(screen.getByTestId('website-tile-5')).toHaveAttribute('src', 'https://example.test/wx');
    expect(screen.queryByTestId('stream-5')).toBeNull();
  });
});

/**
 * Legacy lays the wall out on a 48-column gridstack; `items` is the same
 * geometry (`Positions.gridStack`), so tiles keep the widths they were
 * saved with and Edit Layout can resize them column by column.
 */
describe('MontageClassicGrid — 48-column placement and resize', () => {
  const twoUneven = [
    { id: '1', x: 0, y: 0, w: 36, h: 400 },
    { id: '2', x: 36, y: 0, w: 12, h: 400 },
  ];

  it('spans each tile over its own columns rather than an even grid', () => {
    render(
      <MontageClassicGrid
        monitors={[makeMonitor({ id: 1 }), makeMonitor({ id: 2, name: 'Drive' })]}
        columns={2}
        protocol="webrtc"
        items={twoUneven}
      />,
    );
    expect(screen.getByTestId('montage-classic-grid')).toHaveAttribute('data-columns', '48');
    expect(screen.getByTestId('montage-classic-cell-1')).toHaveStyle({ gridColumn: '1 / span 36' });
    expect(screen.getByTestId('montage-classic-cell-2')).toHaveStyle({ gridColumn: '37 / span 12' });
  });

  it('falls back to the plain column grid when no layout places the tiles', () => {
    render(<MontageClassicGrid monitors={[makeMonitor({ id: 1 })]} columns={3} protocol="webrtc" />);
    const grid = screen.getByTestId('montage-classic-grid');
    expect(grid).toHaveAttribute('data-columns', '3');
    expect(screen.getByTestId('montage-classic-cell-1')).not.toHaveAttribute('data-gs-id');
  });

  it('resizes a tile by dragging its handle, one grid column at a time', () => {
    const onResize = vi.fn();
    render(
      <MontageClassicGrid
        monitors={[makeMonitor({ id: 1 }), makeMonitor({ id: 2, name: 'Drive' })]}
        columns={2}
        protocol="webrtc"
        editMode
        items={twoUneven}
        onResize={onResize}
      />,
    );
    const grid = screen.getByTestId('montage-classic-grid');
    // jsdom has no layout: give the wall a width so a column is 10 px.
    Object.defineProperty(grid, 'clientWidth', { value: 480, configurable: true });
    const handle = screen.getByTestId('montage-classic-resize-1');
    fireEvent.pointerDown(handle, { clientX: 360, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 420, pointerId: 1 });
    expect(onResize).toHaveBeenCalledWith(1, 42);
    fireEvent.pointerUp(handle, { pointerId: 1 });
    onResize.mockClear();
    fireEvent.pointerMove(handle, { clientX: 300, pointerId: 1 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('clamps the drag to the canvas and ignores a wall it cannot measure', () => {
    const onResize = vi.fn();
    render(
      <MontageClassicGrid
        monitors={[makeMonitor({ id: 1 })]}
        columns={1}
        protocol="webrtc"
        editMode
        items={[{ id: '1', x: 0, y: 0, w: 24, h: 400 }]}
        onResize={onResize}
      />,
    );
    const handle = screen.getByTestId('montage-classic-resize-1');
    // No width on the wall (jsdom default) — nothing to drag against.
    fireEvent.pointerDown(handle, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 400, pointerId: 1 });
    expect(onResize).not.toHaveBeenCalled();

    const grid = screen.getByTestId('montage-classic-grid');
    Object.defineProperty(grid, 'clientWidth', { value: 480, configurable: true });
    fireEvent.pointerDown(handle, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 4000, pointerId: 1 });
    expect(onResize).toHaveBeenLastCalledWith(1, 48);
  });

  it('resizes from the keyboard, and says how wide the tile is', () => {
    const onResize = vi.fn();
    render(
      <MontageClassicGrid
        monitors={[makeMonitor({ id: 1 })]}
        columns={1}
        protocol="webrtc"
        editMode
        items={[{ id: '1', x: 0, y: 0, w: 24, h: 400 }]}
        onResize={onResize}
      />,
    );
    const handle = screen.getByRole('slider', { name: 'Width of Front Door in grid columns' });
    expect(handle).toHaveAttribute('aria-valuenow', '24');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onResize).toHaveBeenCalledWith(1, 25);
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onResize).toHaveBeenCalledWith(1, 23);
    onResize.mockClear();
    fireEvent.keyDown(handle, { key: 'Enter' });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('shows no resize handle outside edit mode', () => {
    render(
      <MontageClassicGrid
        monitors={[makeMonitor({ id: 1 })]}
        columns={1}
        protocol="webrtc"
        items={[{ id: '1', x: 0, y: 0, w: 48, h: 400 }]}
        onResize={vi.fn()}
      />,
    );
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
});
