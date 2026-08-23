import { describe, expect, it } from 'vitest';
import { homeViewRoute } from './homeView';

describe('homeViewRoute', () => {
  it('maps ZoneMinder view names to this UI routes', () => {
    expect(homeViewRoute('montage')).toBe('/montage');
    expect(homeViewRoute('events')).toBe('/events');
    expect(homeViewRoute('log')).toBe('/logs');
  });

  it('is case and whitespace insensitive, as the config row is hand-edited', () => {
    expect(homeViewRoute('  Montage ')).toBe('/montage');
    expect(homeViewRoute('CYCLE')).toBe('/cycle');
  });

  it('falls back to the console rather than stranding the operator', () => {
    // Unset, blank, and views this UI does not implement (bandwidth profiles
    // are deliberately out of scope) must all land somewhere useful.
    for (const bad of [undefined, null, '', '   ', 'bandwidth', 'donate', 'nonsense']) {
      expect(homeViewRoute(bad)).toBe('/');
    }
  });
});
