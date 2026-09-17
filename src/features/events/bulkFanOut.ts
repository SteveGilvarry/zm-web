import { useCallback, useState } from 'react';

export interface BulkFailure {
  id: number;
  message: string;
}

export interface BulkProgress {
  /** Label of the action in flight / just finished, or null when idle. */
  action: string | null;
  done: number;
  total: number;
  failed: BulkFailure[];
  running: boolean;
}

const IDLE: BulkProgress = { action: null, done: 0, total: 0, failed: [], running: false };

/** Legacy sends `eids[]` ten at a time (events.js `deleteEvents`); so do we. */
export const BULK_CHUNK_SIZE = 10;

/**
 * Run one request per id, `BULK_CHUNK_SIZE` at a time, and keep going past
 * failures so a single 404 in the middle of a selection does not abandon
 * the rest. Calls `onProgress` after every chunk; resolves with the failures.
 */
export async function fanOut(
  ids: number[],
  run: (id: number) => Promise<unknown>,
  onProgress?: (done: number, failed: BulkFailure[]) => void,
): Promise<BulkFailure[]> {
  const failed: BulkFailure[] = [];
  let done = 0;
  for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + BULK_CHUNK_SIZE);
    const results = await Promise.allSettled(chunk.map((id) => run(id)));
    results.forEach((r, j) => {
      if (r.status === 'rejected') {
        const e: unknown = r.reason;
        failed.push({ id: chunk[j], message: e instanceof Error ? e.message : String(e) });
      }
    });
    done += chunk.length;
    onProgress?.(done, failed.slice());
  }
  return failed;
}

/**
 * Hook wrapper: progress state for the bulk bar plus a `start` that runs
 * `fanOut` and reports partial failures instead of throwing.
 */
export function useBulkFanOut(): {
  progress: BulkProgress;
  start: (action: string, ids: number[], run: (id: number) => Promise<unknown>) => Promise<BulkFailure[]>;
  dismiss: () => void;
} {
  const [progress, setProgress] = useState<BulkProgress>(IDLE);

  const start = useCallback(async (action: string, ids: number[], run: (id: number) => Promise<unknown>) => {
    setProgress({ action, done: 0, total: ids.length, failed: [], running: true });
    const failed = await fanOut(ids, run, (done, f) =>
      setProgress({ action, done, total: ids.length, failed: f, running: true }),
    );
    setProgress({ action, done: ids.length, total: ids.length, failed, running: false });
    return failed;
  }, []);

  return { progress, start, dismiss: () => setProgress(IDLE) };
}
