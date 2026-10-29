import { describe, expect, it } from 'vitest';
import { loggedInUsers, parsePhpSession } from './phpSession';

const ROW = 'remoteAddr|s:12:"192.168.0.10";username|s:5:"admin";user|a:3:{s:2:"Id";i:1;s:8:"Username";s:5:"admin";s:6:"System";s:4:"Edit";}generated_at|i:1760000000;';

describe('parsePhpSession', () => {
  it('reads the pairs session_encode writes, arrays included', () => {
    expect(parsePhpSession(ROW)).toEqual({
      remoteAddr: '192.168.0.10',
      username: 'admin',
      user: { Id: 1, Username: 'admin', System: 'Edit' },
      generated_at: 1760000000,
    });
  });

  it('handles null, booleans, doubles, lists and an accented name', () => {
    expect(parsePhpSession('a|N;b|b:1;c|d:1.5;d|a:2:{i:0;s:1:"x";i:1;s:1:"y";}e|s:5:"José";')).toEqual({
      a: null, b: true, c: 1.5, d: ['x', 'y'], e: 'José',
    });
  });

  it('keeps what it read before a token it cannot parse', () => {
    expect(parsePhpSession('username|s:5:"admin";junk|q:1;')).toEqual({ username: 'admin' });
    expect(parsePhpSession('')).toEqual({});
  });
});

describe('loggedInUsers', () => {
  const now = 1760000000;
  it('keeps live, signed-in rows within the cookie lifetime, newest first', () => {
    const rows = [
      { access: now - 10, data: ROW },
      { access: now - 5, data: 'remoteAddr|s:8:"10.0.0.2";username|s:3:"bob";' },
      { access: now - 100_000, data: ROW },                                 // too old
      { access: now - 1, data: 'username|s:3:"eve";last_time|i:1;' },       // dead session
      { access: now - 1, data: 'remoteAddr|s:8:"10.0.0.9";' },             // not signed in
      { access: null, data: ROW },
      { access: now - 2, data: null },
    ];
    expect(loggedInUsers(rows, 3600, now)).toEqual([
      { username: 'bob', userId: null, remoteAddr: '10.0.0.2', access: now - 5 },
      { username: 'admin', userId: 1, remoteAddr: '192.168.0.10', access: now - 10 },
    ]);
  });

  it('stops at a hundred rows like the legacy query', () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({ access: now - i, data: `username|s:2:"u${i % 10}";` }));
    expect(loggedInUsers(rows, 3600, now)).toHaveLength(100);
  });
});
