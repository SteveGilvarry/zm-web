import { describe, expect, it } from 'vitest';
import { makeServer } from '@/test/fixtures/admin';
import { serverCoords, serverDaemons, serverUrl, SERVER_DAEMONS } from './serverFields';

describe('serverUrl', () => {
  it('composes protocol, hostname and a non-default port', () => {
    expect(serverUrl(makeServer({ protocol: 'https', hostname: 'zm-node-1.local', port: 8443 })))
      .toBe('https://zm-node-1.local:8443');
  });

  it('omits the port when the protocol already implies it', () => {
    expect(serverUrl(makeServer({ protocol: 'http', port: 80 }))).toBe('http://zm-node-1.local');
    expect(serverUrl(makeServer({ protocol: 'https', port: 443 }))).toBe('https://zm-node-1.local');
    // Mismatched pairs keep the port — 443 over http is not the http default.
    expect(serverUrl(makeServer({ protocol: 'http', port: 443 }))).toBe('http://zm-node-1.local:443');
  });

  it('omits a null, zero or negative port', () => {
    expect(serverUrl(makeServer({ protocol: 'http', port: null }))).toBe('http://zm-node-1.local');
    expect(serverUrl(makeServer({ protocol: 'http', port: 0 }))).toBe('http://zm-node-1.local');
  });

  it('falls back to host:port when the protocol is missing', () => {
    // What `POST /servers` actually returns today: protocol is never set.
    expect(serverUrl(makeServer({ protocol: null, hostname: 'probe.local', port: 8080 })))
      .toBe('probe.local:8080');
    expect(serverUrl(makeServer({ protocol: '   ', hostname: 'probe.local', port: null })))
      .toBe('probe.local');
  });

  it('has no url without a hostname', () => {
    expect(serverUrl(makeServer({ hostname: null }))).toBeNull();
    expect(serverUrl(makeServer({ hostname: '  ' }))).toBeNull();
    expect(serverUrl(makeServer({ hostname: undefined }))).toBeNull();
  });

  it('normalises a protocol stored with its separator', () => {
    expect(serverUrl(makeServer({ protocol: 'HTTPS://', hostname: 'a.local', port: 443 })))
      .toBe('https://a.local');
  });

  it('trims surrounding whitespace on the hostname', () => {
    expect(serverUrl(makeServer({ protocol: 'http', hostname: ' a.local ', port: 8080 })))
      .toBe('http://a.local:8080');
  });
});

describe('serverDaemons', () => {
  it('reports the four flags in legacy order', () => {
    expect(serverDaemons(makeServer({ zmstats: 1, zmaudit: 0, zmtrigger: 1, zmeventnotification: 0 })))
      .toEqual([
        { daemon: 'zmstats', enabled: true },
        { daemon: 'zmaudit', enabled: false },
        { daemon: 'zmtrigger', enabled: true },
        { daemon: 'zmeventnotification', enabled: false },
      ]);
    expect(SERVER_DAEMONS).toHaveLength(4);
  });

  it('treats anything but 1 — including a pre-#25 absent field — as off', () => {
    expect(serverDaemons({}).every((d) => !d.enabled)).toBe(true);
  });
});

describe('serverCoords', () => {
  it('renders a decimal pair, accepting the string form the API may send', () => {
    expect(serverCoords(makeServer({ latitude: 51.5074, longitude: -0.1278 }))).toBe('51.5074, -0.1278');
    expect(serverCoords(makeServer({ latitude: '51.5074', longitude: '-0.1278' }))).toBe('51.5074, -0.1278');
    expect(serverCoords(makeServer({ latitude: 0, longitude: 0 }))).toBe('0, 0');
  });

  it('is null unless both halves are present and numeric', () => {
    expect(serverCoords(makeServer())).toBeNull();
    expect(serverCoords(makeServer({ latitude: 51.5, longitude: null }))).toBeNull();
    expect(serverCoords(makeServer({ latitude: 'north', longitude: '2' }))).toBeNull();
  });
});
