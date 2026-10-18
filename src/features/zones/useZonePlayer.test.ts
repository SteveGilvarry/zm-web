import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { resolveZonePlayer, useZonePlayer } from './useZonePlayer';

afterEach(() => window.localStorage.clear());

describe('resolveZonePlayer — Auto follows the monitor\'s Default Player', () => {
  it('plays stills for ZMS or no preference, the nearest thing to ZMS MJPEG', () => {
    expect(resolveZonePlayer('', '')).toBe('stills');
    expect(resolveZonePlayer('', null)).toBe('stills');
    expect(resolveZonePlayer('', 'zms')).toBe('stills');
  });

  it('plays HLS for any HLS player and WebRTC for the rest', () => {
    expect(resolveZonePlayer('', 'go2rtc_hls')).toBe('hls');
    expect(resolveZonePlayer('', 'rtsp2web_hls')).toBe('hls');
    expect(resolveZonePlayer('', 'go2rtc_webrtc')).toBe('webrtc');
    expect(resolveZonePlayer('', 'go2rtc_mse')).toBe('webrtc');
    expect(resolveZonePlayer('', 'janus')).toBe('webrtc');
    expect(resolveZonePlayer('', 'go2rtc')).toBe('webrtc');
  });

  it('lets an explicit choice win', () => {
    expect(resolveZonePlayer('hls', 'janus')).toBe('hls');
    expect(resolveZonePlayer('stills', 'go2rtc_webrtc')).toBe('stills');
  });
});

describe('useZonePlayer', () => {
  it('remembers the choice per browser, as legacy\'s zmZonePlayer cookie does', () => {
    const first = renderHook(() => useZonePlayer('janus'));
    expect(first.result.current.player).toBe('');
    expect(first.result.current.resolved).toBe('webrtc');
    act(() => first.result.current.setPlayer('hls'));
    expect(first.result.current.resolved).toBe('hls');

    const second = renderHook(() => useZonePlayer('janus'));
    expect(second.result.current.player).toBe('hls');
  });

  it('ignores a stored value it does not know', () => {
    window.localStorage.setItem('zmZonePlayer', 'go2rtc_mse');
    expect(renderHook(() => useZonePlayer(null)).result.current.player).toBe('');
  });
});
