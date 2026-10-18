/**
 * The zones page picture: what plays under the polygons, and the polygons
 * themselves.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { makeMonitor, makeZone } from '@/test/fixtures';
import { ZonesPicture } from './ZonesPicture';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; [k: string]: unknown }) => {
    delete rest.params;
    delete rest.search;
    return <a href={to ?? '#'} {...rest}>{children}</a>;
  },
}));
vi.mock('@/hooks/useRefreshingSnapshot', () => ({ useRefreshingSnapshot: () => 'blob:snapshot' }));
const start = vi.hoisted(() => vi.fn());
const stub = { videoRef: { current: null }, state: 'idle', error: null, hasAudio: false, start, stop: vi.fn(), pause: vi.fn() };
vi.mock('@/hooks/useWebRtcStream', () => ({ useWebRtcStream: () => stub }));
vi.mock('@/hooks/useHlsStream', () => ({ useHlsStream: () => stub }));

const frame = { width: 1920, height: 1080 };

describe('ZonesPicture', () => {
  it('shows stills for a monitor with no preferred player', () => {
    render(<ZonesPicture monitor={makeMonitor({ id: 1 })} frame={frame} zones={[]} onZoneClick={() => {}} />);
    expect(screen.getByAltText('Monitor snapshot')).toHaveAttribute('src', 'blob:snapshot');
    expect(start).not.toHaveBeenCalled();
  });

  it('streams with the monitor\'s own player, as legacy\'s zones page does', () => {
    render(
      <ZonesPicture
        monitor={makeMonitor({ id: 1, default_player: 'go2rtc_webrtc' })}
        frame={frame}
        zones={[]}
        onZoneClick={() => {}}
      />,
    );
    expect(screen.getByTestId('zone-video-webrtc')).toBeInTheDocument();
    expect(start).toHaveBeenCalled();
  });

  it('shows nothing live for a monitor that is not capturing', () => {
    render(<ZonesPicture monitor={makeMonitor({ id: 1, capturing: 'None' })} frame={frame} zones={[]} onZoneClick={() => {}} />);
    expect(screen.queryByAltText('Monitor snapshot')).toBeNull();
    expect(screen.queryByTestId('zone-video-webrtc')).toBeNull();
  });

  it('opens a zone from its polygon, drawn in pixels even when stored in percent', () => {
    const onZoneClick = vi.fn();
    render(
      <ZonesPicture
        monitor={makeMonitor({ id: 1 })}
        frame={frame}
        zones={[makeZone({ id: 4, coords: '0.00,0.00 50.00,0.00 50.00,50.00 0.00,50.00' })]}
        onZoneClick={onZoneClick}
      />,
    );
    const polygon = screen.getByTestId('zone-polygon-4');
    expect(polygon.getAttribute('points')).toBe('0,0 960,0 960,540 0,540');
    fireEvent.click(polygon);
    expect(onZoneClick).toHaveBeenCalledWith(4);
  });

  it('hides Edit monitor from someone who cannot edit it', () => {
    render(<ZonesPicture monitor={makeMonitor({ id: 1 })} frame={frame} zones={[]} onZoneClick={() => {}} canEditMonitor={false} />);
    expect(screen.queryByRole('link', { name: 'Edit monitor' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Open watch page' })).toBeInTheDocument();
  });
});
