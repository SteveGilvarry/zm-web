/**
 * WebSite monitors: legacy embeds the configured URL instead of a stream
 * (`Monitor::getStreamHTML` → `getWebSiteUrl`).
 */
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import type { Monitor } from '@/types';
import { WebsiteTile } from './WebsiteTile';
import { isWebsiteMonitor } from './websiteMonitor';

const monitor = (): Monitor => ({
  id: 9, name: 'Weather', type: 'WebSite', path: 'https://example.test/wx',
  width: 1920, height: 1080, orientation: 'ROTATE_0',
} as unknown as Monitor);

describe('isWebsiteMonitor', () => {
  it('is true only for the WebSite type', () => {
    expect(isWebsiteMonitor({ type: 'WebSite' })).toBe(true);
    expect(isWebsiteMonitor({ type: 'Ffmpeg' })).toBe(false);
  });
});

describe('WebsiteTile', () => {
  it('embeds the monitor path in a titled iframe', () => {
    renderWithProviders(<WebsiteTile monitor={monitor()} />);
    const frame = screen.getByTestId('website-tile-9');
    expect(frame).toHaveAttribute('src', 'https://example.test/wx');
    expect(frame).toHaveAttribute('title', 'Weather');
    expect(frame.tagName).toBe('IFRAME');
  });

  it('says so when no site is configured', () => {
    renderWithProviders(<WebsiteTile monitor={{ ...monitor(), path: '' } as Monitor} />);
    expect(screen.queryByTestId('website-tile-9')).toBeNull();
    expect(screen.getByText('No web site configured for this monitor.')).toBeInTheDocument();
  });
});
