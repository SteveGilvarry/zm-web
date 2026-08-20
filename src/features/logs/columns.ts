import type { LogColumnKey } from './csv';

/** Every column the logs table knows how to render, in canonical order. */
export const ALL_LOG_COLUMNS: LogColumnKey[] = [
  'timestamp', 'level', 'component', 'server', 'pid', 'file', 'line', 'message',
];

/** Columns shown until the operator picks their own set. */
export const DEFAULT_VISIBLE_LOG_COLUMNS: LogColumnKey[] = [
  'timestamp', 'level', 'component', 'pid', 'message',
];
