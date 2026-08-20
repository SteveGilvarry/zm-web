import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  Monitor,
  Search,
  Grid3X3,
  List,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { AddMonitorDialog } from '@/features/monitors/AddMonitorDialog';
import {
  MONITORS_STATUS_FILTERS,
  useMonitorsListPage,
  type MonitorsListPageState,
  type MonitorsStatusFilter,
} from '@/features/monitors/useMonitorsListPage';
import { useDocumentTitle } from './useDocumentTitle';

/**
 * Monitors list — Mission Control chrome: search, status filter, add /
 * refresh / view toggle, count line, skeleton, empty state, pagination and
 * the add-monitor dialog. The rows themselves are pluggable so the classic
 * skin can drop its table into the same frame.
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
    isAuthenticated, isLoading, monitors, filteredMonitors, total, totalPages, page, setPage,
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
      <main className="flex-1 p-6 overflow-auto">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  placeholder={t('Search monitors...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={clsx(
                    'ps-10 pe-4 py-2 w-64',
                    'bg-surface border border-border-subtle rounded-lg',
                    'text-text-primary placeholder:text-text-muted',
                    'focus:outline-none focus:border-cyan/50',
                    'transition-colors'
                  )}
                />
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1 p-1 bg-surface border border-border-subtle rounded-lg">
                {MONITORS_STATUS_FILTERS.map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={clsx(
                      'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                      statusFilter === status
                        ? 'bg-cyan/20 text-cyan'
                        : 'text-text-muted hover:text-text-primary'
                    )}
                  >
                    {statusLabel(status)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Add monitor */}
              <button
                onClick={openAdd}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan/15 border border-cyan/40 text-cyan hover:bg-cyan/25 transition-colors text-sm font-medium"
              >
                <Plus size={14} />
                {t('Add monitor')}
              </button>

              {/* Refresh */}
              <button
                onClick={refetch}
                aria-label={t('Refresh')}
                title={t('Refresh')}
                className="p-2 rounded-lg bg-surface border border-border-subtle text-text-muted hover:text-text-primary hover:border-cyan/50 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              {/* View Toggle */}
              <div className="flex items-center gap-1 p-1 bg-surface border border-border-subtle rounded-lg">
                <button
                  onClick={() => setViewMode('grid')}
                  aria-label={t('Grid view')}
                  className={clsx(
                    'p-2 rounded-md transition-colors',
                    viewMode === 'grid'
                      ? 'bg-cyan/20 text-cyan'
                      : 'text-text-muted hover:text-text-primary'
                  )}
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  aria-label={t('List view')}
                  className={clsx(
                    'p-2 rounded-md transition-colors',
                    viewMode === 'list'
                      ? 'bg-cyan/20 text-cyan'
                      : 'text-text-muted hover:text-text-primary'
                  )}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Monitor Count */}
          <div className="mb-4 text-sm text-text-muted">
            {t('Showing {{shown}} of {{count}} monitors', { shown: filteredMonitors.length, count: monitors.length })}
            {total && total > monitors.length && (
              <span> {t('({{total}} total)', { total })}</span>
            )}
          </div>

          {/* Content */}
          {isLoading ? (
            <div className={clsx(
              viewMode === 'grid'
                ? 'grid grid-cols-4 gap-4'
                : 'flex flex-col gap-3'
            )}>
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className={clsx(
                    'bg-surface border border-border-subtle rounded-xl animate-pulse',
                    viewMode === 'grid' ? 'aspect-video' : 'h-20'
                  )}
                />
              ))}
            </div>
          ) : filteredMonitors.length === 0 ? (
            <Panel>
              <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                <Monitor size={48} className="mb-4 opacity-50" />
                <p className="text-lg">{t('No monitors found')}</p>
                <p className="text-sm mt-1">{t('Try adjusting your filters')}</p>
              </div>
            </Panel>
          ) : (
            renderMonitors(state)
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label={t('Previous page')}
                className={clsx(
                  'p-2 rounded-lg border transition-colors',
                  page === 1
                    ? 'bg-surface border-border-subtle text-text-muted cursor-not-allowed'
                    : 'bg-surface border-border-subtle text-text-primary hover:border-cyan/50'
                )}
              >
                <ChevronLeft className="w-4 h-4 rtl:-scale-x-100" />
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={clsx(
                        'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                        page === pageNum
                          ? 'bg-cyan text-void'
                          : 'bg-surface border border-border-subtle text-text-secondary hover:text-text-primary hover:border-cyan/50'
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                aria-label={t('Next page')}
                className={clsx(
                  'p-2 rounded-lg border transition-colors',
                  page === totalPages
                    ? 'bg-surface border-border-subtle text-text-muted cursor-not-allowed'
                    : 'bg-surface border-border-subtle text-text-primary hover:border-cyan/50'
                )}
              >
                <ChevronRight className="w-4 h-4 rtl:-scale-x-100" />
              </button>
            </div>
          )}
      </main>

      <AddMonitorDialog open={showAdd} onClose={closeAdd} />
    </AppShell>
  );
}
