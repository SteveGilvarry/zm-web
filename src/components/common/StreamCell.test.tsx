import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';

// Mock both streaming hooks so the component renders without trying to
// negotiate a real WebRTC offer / fetch an HLS playlist.
const mockHook = vi.fn();
vi.mock('@/hooks/useWebRtcStream', () => ({
  useWebRtcStream: (id: number) => mockHook(id),
}));
vi.mock('@/hooks/useHlsStream', () => ({
  useHlsStream: (id: number) => mockHook(id),
}));

import { StreamCell } from './StreamCell';

function makeStream(overrides: Partial<{
  state: string;
  error: string | null;
  hasAudio: boolean;
}> = {}) {
  return {
    videoRef: createRef<HTMLVideoElement>(),
    state: overrides.state ?? 'idle',
    error: overrides.error ?? null,
    hasAudio: overrides.hasAudio ?? false,
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
  };
}

beforeEach(() => {
  mockHook.mockReset();
});

describe('StreamCell — protocol switch', () => {
  it('calls useHlsStream (not useWebRtcStream) when protocol="hls"', () => {
    mockHook.mockReturnValue(makeStream());
    render(<StreamCell protocol="hls" monitorId={5} />);
    expect(mockHook).toHaveBeenCalledWith(5);
  });

  it('calls useWebRtcStream when protocol="webrtc"', () => {
    mockHook.mockReturnValue(makeStream());
    render(<StreamCell protocol="webrtc" monitorId={9} />);
    expect(mockHook).toHaveBeenCalledWith(9);
  });
});

describe('StreamCell — connection states', () => {
  it('shows OFFLINE when idle and autoStart is false', () => {
    mockHook.mockReturnValue(makeStream({ state: 'idle' }));
    render(<StreamCell protocol="hls" monitorId={1} />);
    expect(screen.getByText('OFFLINE')).toBeInTheDocument();
  });

  it('shows the spinner while connecting', () => {
    mockHook.mockReturnValue(makeStream({ state: 'connecting' }));
    const { container } = render(<StreamCell protocol="hls" monitorId={1} />);
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('shows "Negotiating..." caption while signaling', () => {
    mockHook.mockReturnValue(makeStream({ state: 'signaling' }));
    render(<StreamCell protocol="hls" monitorId={1} />);
    expect(screen.getByText(/negotiating/i)).toBeInTheDocument();
  });

  it('shows LIVE badge when connected', () => {
    mockHook.mockReturnValue(makeStream({ state: 'connected' }));
    render(<StreamCell protocol="hls" monitorId={1} monitorName="Garage" />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('Garage')).toBeInTheDocument();
  });

  it('shows Retry button when failed and re-starts on click', async () => {
    const stream = makeStream({ state: 'failed', error: 'WebRTC handshake failed' });
    mockHook.mockReturnValue(stream);

    const user = userEvent.setup();
    render(<StreamCell protocol="webrtc" monitorId={1} />);

    expect(screen.getByText(/handshake failed/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(stream.stop).toHaveBeenCalled();
  });
});

describe('StreamCell — orientation', () => {
  it('does not apply rotation styles for Rotate0', () => {
    mockHook.mockReturnValue(makeStream({ state: 'connected' }));
    const { container } = render(
      <StreamCell protocol="hls" monitorId={1} orientation="Rotate0" />,
    );
    const video = container.querySelector('video')!;
    expect(video.style.transform).toBe('');
  });

  it('rotationFit="fit" applies a simple rotate transform for Rotate90', () => {
    mockHook.mockReturnValue(makeStream({ state: 'connected' }));
    const { container } = render(
      <StreamCell
        protocol="hls"
        monitorId={1}
        orientation="Rotate90"
        rotationFit="fit"
      />,
    );
    const video = container.querySelector('video')!;
    expect(video.style.transform).toContain('rotate(90deg)');
    // 'fit' uses the small-scale variant — letterboxed.
    expect(video.style.transform).toContain('scale(0.5625)');
  });

  it('rotationFit="fill" swaps dimensions for Rotate90 (177% wide)', () => {
    mockHook.mockReturnValue(makeStream({ state: 'connected' }));
    const { container } = render(
      <StreamCell
        protocol="hls"
        monitorId={1}
        orientation="Rotate90"
        rotationFit="fill"
      />,
    );
    const video = container.querySelector('video')!;
    // 'fill' uses absolute positioning + swapped width/height percentages.
    expect(video.style.width).toBe('177.7778%');
    expect(video.style.height).toBe('56.25%');
    expect(video.style.position).toBe('absolute');
    expect(video.style.transform).toContain('rotate(90deg)');
  });

  it('rotationFit="fill" rotates 270° when orientation=Rotate270', () => {
    mockHook.mockReturnValue(makeStream({ state: 'connected' }));
    const { container } = render(
      <StreamCell
        protocol="hls"
        monitorId={1}
        orientation="Rotate270"
        rotationFit="fill"
      />,
    );
    const video = container.querySelector('video')!;
    expect(video.style.transform).toContain('rotate(270deg)');
  });
});

describe('StreamCell — interaction', () => {
  it('forwards onClick / onDoubleClick to the wrapper', async () => {
    mockHook.mockReturnValue(makeStream({ state: 'connected' }));
    const onClick = vi.fn();
    const onDoubleClick = vi.fn();
    const user = userEvent.setup();
    render(
      <StreamCell
        protocol="hls"
        monitorId={1}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />,
    );
    // The wrapper is the first child div.
    const wrapper = screen.getByText('LIVE').closest('div.relative')!;
    await user.click(wrapper);
    expect(onClick).toHaveBeenCalled();
    await user.dblClick(wrapper);
    expect(onDoubleClick).toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/*  Wall gating — viewport × tab visibility × live-tile budget                */
/* -------------------------------------------------------------------------- */

import { act } from '@testing-library/react';
import { liveTileBudget } from '@/streaming/liveTileBudget';
import { useUiStore } from '@/stores/ui';

const inViewMock = vi.fn(() => true);
const tabVisibleMock = vi.fn(() => true);
vi.mock('@/hooks/useInViewport', () => ({ useInViewport: () => inViewMock() }));
vi.mock('@/hooks/useDocumentVisible', () => ({ useDocumentVisible: () => tabVisibleMock() }));

describe('StreamCell — gated tiles', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    liveTileBudget.reset();
    useUiStore.setState({ maxLiveTiles: 12 });
    inViewMock.mockReturnValue(true);
    tabVisibleMock.mockReturnValue(true);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('an ungated autoStart tile starts after the stagger delay', () => {
    const stream = makeStream();
    mockHook.mockReturnValue(stream);
    render(<StreamCell protocol="webrtc" monitorId={1} autoStart />);
    act(() => { vi.advanceTimersByTime(700); });
    expect(stream.start).toHaveBeenCalledTimes(1);
  });

  it('a gated tile out of the viewport never starts and pauses instead', () => {
    inViewMock.mockReturnValue(false);
    const stream = makeStream();
    mockHook.mockReturnValue(stream);
    render(<StreamCell protocol="webrtc" monitorId={1} autoStart gated />);
    act(() => { vi.advanceTimersByTime(700); });
    expect(stream.start).not.toHaveBeenCalled();
    expect(stream.pause).toHaveBeenCalled();
  });

  it('a gated tile in view starts, and a hidden tab pauses it', () => {
    const stream = makeStream();
    mockHook.mockReturnValue(stream);
    const { rerender } = render(<StreamCell protocol="webrtc" monitorId={1} autoStart gated />);
    act(() => { vi.advanceTimersByTime(700); });
    expect(stream.start).toHaveBeenCalledTimes(1);

    tabVisibleMock.mockReturnValue(false);
    rerender(<StreamCell protocol="webrtc" monitorId={1} autoStart gated />);
    expect(stream.pause).toHaveBeenCalled();
  });

  it('tiles past the live-tile cap wait with a placeholder and start once a slot frees', () => {
    useUiStore.setState({ maxLiveTiles: 1 });
    const a = makeStream();
    const b = makeStream();
    mockHook.mockImplementation((id: number) => (id === 1 ? a : b));
    const { unmount: unmountA } = render(<StreamCell protocol="webrtc" monitorId={1} autoStart gated />);
    render(<StreamCell protocol="webrtc" monitorId={2} autoStart gated />);
    act(() => { vi.advanceTimersByTime(700); });
    expect(a.start).toHaveBeenCalledTimes(1);
    expect(b.start).not.toHaveBeenCalled();
    expect(screen.getByTestId('stream-over-budget')).toBeInTheDocument();

    unmountA();
    act(() => { vi.advanceTimersByTime(700); });
    expect(b.start).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('stream-over-budget')).toBeNull();
  });

  it('falls back to HLS when WebRTC ends in failed', () => {
    const rtc = makeStream({ state: 'failed', error: 'ICE failed after max retries' });
    const hls = makeStream({ state: 'connected' });
    let calls = 0;
    mockHook.mockImplementation(() => (calls++ === 0 ? rtc : hls));
    render(<StreamCell protocol="webrtc" monitorId={1} autoStart />);
    expect(screen.getByText(/HLS · fallback/)).toBeInTheDocument();
  });

  it('renders the status caption beside the name when asked to', () => {
    mockHook.mockReturnValue(makeStream({ state: 'connected' }));
    render(
      <StreamCell protocol="hls" monitorId={1} monitorName="Garage" statusText="Connected · 10.9 fps" compact showName />,
    );
    expect(screen.getByText('Garage')).toBeInTheDocument();
    expect(screen.getByTestId('stream-status')).toHaveTextContent('Connected · 10.9 fps');
  });
});
