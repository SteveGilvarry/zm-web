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

/**
 * Run one request per id, sequentially, and keep going past failures so a
 * single 404 in the middle of a selection does not abandon the rest. Calls
 * `onProgress` after every id; resolves with the failures.
 */
export async function fanOut(
  ids: number[],
  run: (id: number) => Promise<unknown>,
  onProgress?: (done: number, failed: BulkFailure[]) => void,
): Promise<BulkFailure[]> {
  const failed: BulkFailure[] = [];
  let done = 0;
  for (const id of ids) {
    try {
      await run(id);
    } catch (e) {
      failed.push({ id, message: e instanceof Error ? e.message : String(e) });
    }
    done += 1;
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
