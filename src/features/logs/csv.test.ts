import { describe, expect, it } from 'vitest';
import type { LogEntry } from '@/api/logs';
import { escapeCsvField, logsToCsv } from './csv';

function makeLog(over: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 1,
    time_key: '2026-06-01T10:00:00Z',
    level: 0,
    code: 'INF',
    component: 'zmc',
    message: 'starting capture',
    pid: 4321,
    server_id: null,
    file: 'zm_monitor.cpp',
    line: 123,
    ...over,
  };
}

describe('escapeCsvField', () => {
  it('passes plain values through unchanged', () => {
    expect(escapeCsvField('hello')).toBe('hello');
    expect(escapeCsvField(42)).toBe('42');
  });

  it('wraps values containing commas in quotes', () => {
    expect(escapeCsvField('one, two')).toBe('"one, two"');
  });

  it('doubles up embedded quotes inside a wrapped field', () => {
    expect(escapeCsvField('she said "hi"')).toBe('"she said ""hi"""');
  });

  it('wraps values containing newlines so the row stays intact', () => {
    expect(escapeCsvField('a\nb')).toBe('"a\nb"');
    expect(escapeCsvField('a\r\nb')).toBe('"a\r\nb"');
  });

  it('renders null / undefined as the empty string', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });
});

describe('logsToCsv', () => {
  it('emits a header row that matches the requested columns + order', () => {
    const csv = logsToCsv([], ['timestamp', 'level', 'message']);
    expect(csv).toBe('Timestamp,Level,Message');
  });

  it('serialises each log to one row with the picked columns', () => {
    const csv = logsToCsv(
      [makeLog({ id: 1, message: 'first' }), makeLog({ id: 2, message: 'second' })],
      ['timestamp', 'level', 'component', 'message'],
    );
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3); // header + 2
    expect(lines[1]).toBe('2026-06-01T10:00:00Z,INFO,zmc,first');
    expect(lines[2]).toBe('2026-06-01T10:00:00Z,INFO,zmc,second');
  });

  it('quotes messages with commas so the column count stays valid', () => {
    const csv = logsToCsv(
      [makeLog({ message: 'one, two, three' })],
      ['level', 'message'],
    );
    expect(csv).toBe('Level,Message\nINFO,"one, two, three"');
  });

  it('renders null server_id and pid as empty cells', () => {
    const csv = logsToCsv(
      [makeLog({ server_id: null, pid: null })],
      ['server', 'pid', 'message'],
    );
    expect(csv).toBe('Server,PID,Message\n,,starting capture');
  });
});
