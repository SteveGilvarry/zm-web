import { useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import {
  useAuditData,
  compareAuditRows,
  computeAuditTotals,
  type AuditRow,
  type AuditSortKey,
  type AuditTotals,
} from './useAuditData';

export type AuditSortDir = 'asc' | 'desc';

export interface AuditPageState {
  isAuthenticated: boolean;
  loading: boolean;
  error: Error | null;
  sortKey: AuditSortKey;
  sortDir: AuditSortDir;
  /** Click a column header: same key flips direction, new key sorts ascending. */
  toggleSort: (key: AuditSortKey) => void;
  /** Rows in display order. */
  sorted: AuditRow[];
  /** Column totals across every visible row. */
  totals: AuditTotals;
}

/**
 * Event-integrity audit (legacy `?view=report_event_audit`): per-monitor
 * rollup joined from monitors + event-summaries, plus the sort state both
 * skins' tables share.
 */
export function useAuditPage(): AuditPageState {
  const { isAuthenticated } = useAuthStore();
  const data = useAuditData();

  const [sortKey, setSortKey] = useState<AuditSortKey>('id');
  const [sortDir, setSortDir] = useState<AuditSortDir>('asc');

  const sorted = useMemo(() => {
    const copy = data.rows.slice();
    copy.sort((a, b) => {
      const cmp = compareAuditRows(a, b, sortKey);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [data.rows, sortKey, sortDir]);

  const toggleSort = (key: AuditSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const totals = useMemo(() => computeAuditTotals(sorted), [sorted]);

  return {
    isAuthenticated,
    loading: data.loading,
    error: data.error,
    sortKey,
    sortDir,
    toggleSort,
    sorted,
    totals,
  };
}
