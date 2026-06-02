import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

// Mock the streaming + snapshot hooks so we can drive state directly.
const inViewportMock = vi.fn();
const snapshotMock = vi.fn();
vi.mock('@/hooks/useInViewport', () => ({
  useInViewport: () => inViewportMock(),
}));
vi.mock('@/hooks/useRefreshingSnapshot', () => ({
  useRefreshingSnapshot: (id: number, enabled: boolean) => snapshotMock(id, enabled),
}));
// Mock StreamCell to a sentinel so we can assert it renders without doing
// any real streaming work.
vi.mock('@/components/common/StreamCell', () => ({
  StreamCell: (props: { monitorId: number }) => (
    <div data-testid="live-stream-cell" data-monitor-id={props.monitorId} />
  ),
}));

import { MonitorPreview } from './MonitorPreview';

beforeEach(() => {
  inViewportMock.mockReset();
  snapshotMock.mockReset();
  inViewportMock.mockReturnValue(true);
  snapshotMock.mockReturnValue('blob:fake-snapshot');
});

describe('MonitorPreview — disabled monitor', () => {
  it('shows the VideoOff icon and no snapshot when isActive=false', () => {
    const { container } = render(
      <MonitorPreview monitorId={1} monitorName="Garage" isActive={false} />,
    );
    expect(container.querySelector('img')).toBeNull();
    // The VideoOff icon is rendered as an svg with lucide attributes.
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('does not poll the snapshot endpoint when inactive', () => {
    render(<MonitorPreview monitorId={1} monitorName="Garage" isActive={false} />);
    expect(snapshotMock).toHaveBeenCalledWith(1, false);
  });
});

describe('MonitorPreview — snapshot rendering', () => {
  it('renders the snapshot <img> when active + in-viewport + URL present', () => {
    render(
      <MonitorPreview monitorId={1} monitorName="Garage" isActive={true} />,
    );
    const img = screen.getByRole('img', { name: 'Garage' });
    expect(img).toHaveAttribute('src', 'blob:fake-snapshot');
  });

  it('does NOT render the snapshot <img> when the hook returns null', () => {
    snapshotMock.mockReturnValue(null);
    render(
      <MonitorPreview monitorId={1} monitorName="Garage" isActive={true} />,
    );
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('passes inView through to the snapshot hook (off-screen → disabled)', () => {
    inViewportMock.mockReturnValue(false);
    render(<MonitorPreview monitorId={1} monitorName="Garage" isActive={true} />);
    expect(snapshotMock).toHaveBeenCalledWith(1, false);
  });
});

describe('MonitorPreview — rotation', () => {
  it('applies a basic rotate transform for Rotate90 with rotationFit="fit" (default)', () => {
    render(
      <MonitorPreview
        monitorId={1}
        monitorName="Garage"
        isActive={true}
        orientation="Rotate90"
      />,
    );
    const img = screen.getByRole('img', { name: 'Garage' });
    expect(img.style.transform).toContain('rotate(90deg)');
    expect(img.style.transform).toContain('scale(0.5625)');
    // 'fit' style should NOT use the absolute swap-dimensions layout.
    expect(img.style.position).toBe('');
  });

  it('swaps dimensions (177%) for Rotate90 with rotationFit="fill"', () => {
    render(
      <MonitorPreview
        monitorId={1}
        monitorName="Garage"
        isActive={true}
        orientation="Rotate90"
        rotationFit="fill"
      />,
    );
    const img = screen.getByRole('img', { name: 'Garage' });
    expect(img.style.width).toBe('177.7778%');
    expect(img.style.position).toBe('absolute');
  });

  it('rotates 270° for Rotate270 with rotationFit="fill"', () => {
    render(
      <MonitorPreview
        monitorId={1}
        monitorName="Garage"
        isActive={true}
        orientation="Rotate270"
        rotationFit="fill"
      />,
    );
    const img = screen.getByRole('img', { name: 'Garage' });
    expect(img.style.transform).toContain('rotate(270deg)');
  });
});

describe('MonitorPreview — hover-to-live', () => {
  it('does NOT start a live preview when enableLivePreview is false', () => {
    vi.useFakeTimers();
    const { container } = render(
      <MonitorPreview
        monitorId={1}
        monitorName="Garage"
        isActive={true}
        enableLivePreview={false}
      />,
    );
    const root = container.firstChild as HTMLElement;

    act(() => { fireEvent.mouseEnter(root); });
    act(() => { vi.advanceTimersByTime(500); });

    expect(screen.queryByTestId('live-stream-cell')).toBeNull();
    vi.useRealTimers();
  });

  it('starts a live preview after the 400ms hover-intent delay', () => {
    vi.useFakeTimers();
    render(
      <MonitorPreview
        monitorId={42}
        monitorName="Garage"
        isActive={true}
        enableLivePreview={true}
      />,
    );

    // Trigger React's onMouseEnter synthetically via testing-library.
    const root = screen.getByRole('img', { name: 'Garage' }).parentElement!;
    act(() => { fireEvent.mouseEnter(root); });

    // Below the threshold — no live preview yet.
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByTestId('live-stream-cell')).toBeNull();

    // After the threshold — live cell mounted with the right monitorId.
    act(() => { vi.advanceTimersByTime(500); });
    const liveCell = screen.getByTestId('live-stream-cell');
    expect(liveCell).toHaveAttribute('data-monitor-id', '42');

    vi.useRealTimers();
  });

  it('cancels the pending live preview when the mouse leaves before the threshold', () => {
    vi.useFakeTimers();
    render(
      <MonitorPreview
        monitorId={1}
        monitorName="Garage"
        isActive={true}
        enableLivePreview={true}
      />,
    );
    const root = screen.getByRole('img', { name: 'Garage' }).parentElement!;

    act(() => { fireEvent.mouseEnter(root); });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { fireEvent.mouseLeave(root); });
    act(() => { vi.advanceTimersByTime(800); });

    expect(screen.queryByTestId('live-stream-cell')).toBeNull();
    vi.useRealTimers();
  });
});
