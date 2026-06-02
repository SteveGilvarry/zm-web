const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const i = Math.min(
    BYTE_UNITS.length - 1,
    Math.floor(Math.log(bytes) / Math.log(k)),
  );
  const v = bytes / Math.pow(k, i);
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${BYTE_UNITS[i]}`;
}
