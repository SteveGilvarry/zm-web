import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Grid3X3,
  List,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { AddMonitorDialog } from '@/features/monitors/AddMonitorDialog';
import {
  MONITORS_STATUS_FILTERS,
  useMonitorsListPage,
  type MonitorsListPageState,
  type MonitorsStatusFilter,
} from '@/features/monitors/useMonitorsListPage';
import { useDocumentTitle } from './useDocumentTitle';

const field = clsx(
  'bg-surface border border-border-subtle rounded',
  'text-fg placeholder:text-fg-faint',
  'focus:outline-none focus:border-accent transition-colors',
);
const toolBtn = 'p-1.5 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors disabled:opacity-50';

/**
 * Monitors list — the modern frame.
 *
 * One query line at the top (search, status, view, refresh, add), the
 * cameras filling everything below it, and a status bar carrying the count
 * and the pager. The chrome used to eat two stacked rows and a count line
 * before the first thumbnail; the cameras are the page (docs/DESIGN.md).
 * The rows themselves are pluggable so the classic skin can drop its table
 * into the same frame.
 */
export function MonitorsListLayout({
  renderMonitors,
}: {
  renderMonitors: (state: MonitorsListPageState) => ReactNode;
}) {
  const { t } = useTranslation();
  const state = useMonitorsListPage();
  useDocumentTitle(t('Monitors'));
  const {
    isAuthenticated, isLoading, isError, error, monitors, filteredMonitors, total, totalPages, page, setPage,
    viewMode, setViewMode, searchQuery, setSearchQuery, statusFilter, setStatusFilter,
    showAdd, openAdd, closeAdd, refetch,
  } = state;

  const statusLabel = (status: MonitorsStatusFilter): string => {
    switch (status) {
      case 'all': return t('All');
      case 'active': return t('Active');
      case 'inactive': return t('Inactive');
      case 'streaming': return t('Streaming');
    }
  };

  if (!isAuthenticated) return null;

  return (
    <AppShell title={t('Monitors')}>
      <main className="flex-1 min-h-0 min-w-0 flex flex-col">
        {/* The query line: everything you change often, in one row. */}
        <div className="flex items-center gap-2 px-3 h-11 shrink-0 border-b border-border-subtle bg-surface overflow-x-auto">
          <div className="relative shrink-0">
            <Search className="absolute start-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-faint" aria-hidden />
            <input
              type="search"
              placeholder={t('Search monitors...')}
              aria-label={t('Search monitors')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={clsx(field, 'ps-7 pe-2 py-1 w-44 text-sm')}
            />
          </div>

          <div
            role="group"
            aria-label={t('Status filter')}
            className="shrink-0 flex items-center gap-0.5 rounded border border-border-subtle p-0.5"
          >
            {MONITORS_STATUS_FILTERS.map((status) => (
              <button
                key={status}
                type="button"
                aria-pressed={statusFilter === status}
                onClick={() => setStatusFilter(status)}
                className={clsx(
                  'px-2 py-0.5 rounded text-xs transition-colors',
                  statusFilter === status ? 'bg-accent/15 text-accent' : 'text-fg-dim hover:text-fg',
                )}
              >
                {statusLabel(status)}
              </button>
            ))}
          </div>

          <div className="ms-auto flex items-center gap-2 shrink-0">
            <div
              role="group"
              aria-label={t('View')}
              className="flex items-center gap-0.5 rounded border border-border-subtle p-0.5"
            >
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                aria-label={t('Grid view')}
                aria-pressed={viewMode === 'grid'}
                className={clsx(
                  'p-1 rounded transition-colors',
                  viewMode === 'grid' ? 'bg-accent/15 text-accent' : 'text-fg-dim hover:text-fg',
                )}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                aria-label={t('List view')}
                aria-pressed={viewMode === 'list'}
                className={clsx(
                  'p-1 rounded transition-colors',
                  viewMode === 'list' ? 'bg-accent/15 text-accent' : 'text-fg-dim hover:text-fg',
                )}
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={refetch}
              aria-label={t('Refresh')}
              title={t('Refresh')}
              className={toolBtn}
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <RequirePerm feature="monitors" level="Edit">
              <button
                type="button"
                onClick={openAdd}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-accent text-accent-fg hover:bg-accent-dim transition-colors"
              >
                <Plus size={12} aria-hidden />
                {t('Add monitor')}
              </button>
            </RequirePerm>
          </div>
        </div>

        {/* The cameras own the remaining height and scroll inside it, so the
            query line and the pager stay put. */}
        <div className="flex-1 min-h-0 overflow-auto p-3">
          <QueryState
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={refetch}
            empty={filteredMonitors.length === 0}
            emptyMessage={monitors.length === 0 ? t('No monitors found') : t('Try adjusting your filters')}
          >
            {renderMonitors(state)}
          </QueryState>
        </div>

        {/* Status bar: what this page is showing, and how to leave it. */}
        <div className="flex items-center gap-3 px-3 py-2 shrink-0 border-t border-border-subtle bg-surface text-xs text-fg-dim">
          {t('Showing {{shown}} of {{count}} monitors', { shown: filteredMonitors.length, count: monitors.length })}
          {total && total > monitors.length
            ? <span>{t('({{total}} total)', { total })}</span>
            : null}

          {totalPages > 1 && (
            <nav aria-label={t('Pagination')} className="ms-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label={t('Previous page')}
                className={clsx(
                  'p-1 rounded border border-border-subtle transition-colors',
                  page === 1 ? 'text-fg-faint cursor-not-allowed' : 'text-fg hover:border-accent',
                )}
              >
                <ChevronLeft className="w-4 h-4 rtl:-scale-x-100" />
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5 || page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setPage(pageNum)}
                    aria-label={t('Page {{n}}', { n: pageNum })}
                    aria-current={page === pageNum ? 'page' : undefined}
                    className={clsx(
                      'w-7 h-7 rounded text-xs tabular-nums transition-colors',
                      page === pageNum
                        ? 'bg-accent text-accent-fg'
                        : 'border border-border-subtle text-fg-muted hover:text-fg hover:border-accent',
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                aria-label={t('Next page')}
                className={clsx(
                  'p-1 rounded border border-border-subtle transition-colors',
                  page === totalPages ? 'text-fg-faint cursor-not-allowed' : 'text-fg hover:border-accent',
                )}
              >
                <ChevronRight className="w-4 h-4 rtl:-scale-x-100" />
              </button>
            </nav>
          )}
        </div>
      </main>

      <AddMonitorDialog open={showAdd} onClose={closeAdd} />
    </AppShell>
  );
}
