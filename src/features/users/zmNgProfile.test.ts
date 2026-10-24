import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PROFILE_NAME,
  renderQrSvg,
  zmNgPortalUrl,
  zmNgProfileName,
  zmNgQrPayload,
} from './zmNgProfile';

describe('zmNgProfileName (user.php)', () => {
  it('prefers a changed ZM_WEB_TITLE', () => {
    expect(zmNgProfileName('Back Yard', 'https://example.net')).toBe('Back Yard');
  });
  it('falls back to a changed ZM_HOME_URL when the title is the default or blank', () => {
    expect(zmNgProfileName('ZoneMinder', 'https://zm.example.net')).toBe('https://zm.example.net');
    expect(zmNgProfileName('', 'https://zm.example.net')).toBe('https://zm.example.net');
  });
  it('is "ZoneMinder" when both are stock', () => {
    expect(zmNgProfileName('ZoneMinder', 'https://zoneminder.com')).toBe(DEFAULT_PROFILE_NAME);
    expect(zmNgProfileName(undefined, null)).toBe(DEFAULT_PROFILE_NAME);
  });
});

describe('zmNgPortalUrl', () => {
  it('is the origin plus the build base, without a trailing slash', () => {
    expect(zmNgPortalUrl('https://zm.example.net', '/')).toBe('https://zm.example.net');
    expect(zmNgPortalUrl('https://zm.example.net/', '/zm/')).toBe('https://zm.example.net/zm');
  });
});

describe('zmNgQrPayload', () => {
  it("uses the app's compact keys", () => {
    expect(JSON.parse(zmNgQrPayload({ name: 'ZoneMinder', portalUrl: 'https://h', username: 'admin' }))).toEqual({
      n: 'ZoneMinder', p: 'https://h', u: 'admin',
    });
  });
  it('emits exactly n, p and u: no password, no API or CGI URL (zmNinjaNg would demand both)', () => {
    expect(Object.keys(JSON.parse(zmNgQrPayload({ name: 'n', portalUrl: 'p', username: 'u' })))).toEqual(['n', 'p', 'u']);
  });
});

describe('renderQrSvg', () => {
  it('encodes the text as an SVG document', async () => {
    const svg = await renderQrSvg('{"n":"ZoneMinder"}');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('</svg>');
  });
  it('lets the encoder be mocked', async () => {
    vi.resetModules();
    vi.doMock('qrcode', () => ({ toString: vi.fn(async (text: string) => `<svg>${text}</svg>`) }));
    const { renderQrSvg: mocked } = await import('./zmNgProfile');
    await expect(mocked('x')).resolves.toBe('<svg>x</svg>');
    vi.doUnmock('qrcode');
  });
});
