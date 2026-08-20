import type { LogEntry } from '@/api/logs';
import { levelLabel } from '@/api/logs';

/**
 * Escape a single CSV field per RFC 4180:
 * - Wrap in double-quotes when the value contains a comma, newline, CR, or quote
 * - Double up any embedded quotes inside the wrapped value
 * - null / undefined render as the empty string
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Columns we can export. Mirrors the table column picker. */
export type LogColumnKey =
  | 'timestamp'
  | 'level'
  | 'component'
  | 'server'
  | 'pid'
  | 'file'
  | 'line'
  | 'message';

export const LOG_COLUMN_LABELS: Record<LogColumnKey, string> = {
  timestamp: 'Timestamp',
  level: 'Level',
  component: 'Component',
  server: 'Server',
  pid: 'PID',
  file: 'File',
  line: 'Line',
  message: 'Message',
};

/** Pull a column value out of a LogEntry, in a CSV-friendly representation. */
export function logFieldFor(log: LogEntry, key: LogColumnKey): string | number | null {
  switch (key) {
    case 'timestamp': return log.time_key;
    case 'level':     return levelLabel(log.level);
    case 'component': return log.component;
    case 'server':    return log.server_id ?? '';
    case 'pid':       return log.pid ?? '';
    case 'file':      return log.file ?? '';
    case 'line':      return log.line ?? '';
    case 'message':   return log.message;
  }
}

/**
 * Build a CSV document from log entries, only including the columns the
 * caller asks for (in the order they're given). First row is the header.
 */
export function logsToCsv(logs: LogEntry[], columns: LogColumnKey[]): string {
  const header = columns.map((c) => escapeCsvField(LOG_COLUMN_LABELS[c])).join(',');
  const rows = logs.map((log) =>
    columns.map((c) => escapeCsvField(logFieldFor(log, c))).join(','),
  );
  return [header, ...rows].join('\n');
}

/**
 * Trigger a browser download of the given CSV string. Pulled out so the
 * route can stay focused and so tests can stub the DOM bits.
 */
export function downloadCsv(filename: string, csv: string): void {
  // Prepend a UTF-8 BOM so Excel reliably opens it as UTF-8.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
