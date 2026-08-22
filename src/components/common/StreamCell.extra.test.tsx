/**
 * Two paths the main StreamCell suite doesn't reach: the HLS fallback latch
 * being cleared when the caller picks a different protocol, and the STOP
 * control, which must not also trigger the cell's own click handler.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';

const webrtcHook = vi.fn();
const hlsHook = vi.fn();
vi.mock('@/hooks/useWebRtcStream', () => ({ useWebRtcStream: (id: number) => webrtcHook(id) }));
vi.mock('@/hooks/useHlsStream', () => ({ useHlsStream: (id: number) => hlsHook(id) }));

import { StreamCell } from './StreamCell';

function makeStream(state = 'idle') {
  return {
    videoRef: createRef<HTMLVideoElement>(),
    state,
    error: null,
    hasAudio: false,
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
  };
}

beforeEach(() => {
  webrtcHook.mockReset();
  hlsHook.mockReset();
});

describe('StreamCell — WebRTC to HLS fallback latch', () => {
  it('switches the cell to HLS after WebRTC gives up, and resets when the protocol prop changes', () => {
    webrtcHook.mockReturnValue(makeStream('failed'));
    hlsHook.mockReturnValue(makeStream('connected'));

    const { rerender } = render(
      <StreamCell protocol="webrtc" monitorId={3} hlsFallback autoStart />,
    );
    // The failed WebRTC attempt latched this cell onto HLS.
    expect(hlsHook).toHaveBeenCalledWith(3);

    // Asking for HLS explicitly, then back to WebRTC, clears the latch — the
    // WebRTC hook is consulted again rather than being stuck on the fallback.
    rerender(<StreamCell protocol="hls" monitorId={3} hlsFallback autoStart />);
    webrtcHook.mockClear();
    webrtcHook.mockReturnValue(makeStream('connecting'));
    rerender(<StreamCell protocol="webrtc" monitorId={3} hlsFallback autoStart />);
    expect(webrtcHook).toHaveBeenCalledWith(3);
  });

  it('stays on WebRTC when the caller opts out of the fallback', () => {
    webrtcHook.mockReturnValue(makeStream('failed'));
    hlsHook.mockReturnValue(makeStream('connected'));

    render(<StreamCell protocol="webrtc" monitorId={3} hlsFallback={false} autoStart />);
    expect(hlsHook).not.toHaveBeenCalled();
    expect(webrtcHook).toHaveBeenCalledWith(3);
  });
});

describe('StreamCell — STOP control', () => {
  it('stops the stream without firing the cell click handler', async () => {
    const user = userEvent.setup();
    const stream = makeStream('connected');
    hlsHook.mockReturnValue(stream);
    const onClick = vi.fn();

    render(
      <StreamCell
        protocol="hls"
        monitorId={8}
        monitorName="Garage"
        showControls
        onClick={onClick}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Stop stream for Garage' }));
    expect(stream.stop).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('hides the control while the stream is not connected', () => {
    hlsHook.mockReturnValue(makeStream('connecting'));
    render(<StreamCell protocol="hls" monitorId={8} monitorName="Garage" showControls />);
    expect(screen.queryByRole('button', { name: /Stop stream/ })).toBeNull();
  });
});
