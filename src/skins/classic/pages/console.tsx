import { useState, type DragEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownUp, Columns3, Copy, Download, Filter, FilterX, ListChecks, Pencil, Plus,
  RefreshCw, Trash2,
} from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { MonitorPreview } from '@/components/monitors/MonitorPreview';
import { AddMonitorDialog } from '@/features/monitors/AddMonitorDialog';
import { BulkModeDialog } from '@/features/console/BulkModeDialog';
import { ScanNetworkButton } from '@/features/console/ScanNetworkButton';
import { useClassicConsolePage, type ClassicConsolePageState } from '@/features/console/useClassicConsolePage';
import { CONSOLE_COLUMNS, consoleColumnLabel, type ConsoleColumnKey } from '@/features/console/consoleColumns';
import { functionLines, type ConsoleRow, type ConsoleSortKey } from '@/features/console/consoleTable';
import { monitorSource } from '@/features/monitors/useMonitorFilterRow';
import {
  formatBandwidthLegacy, formatFpsLegacy, runtimeTone, type RuntimeTone,
} from '@/features/monitors/useMonitorStatuses';
import { humanFilesize } from '@/lib/format';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import {
  ClassicButton, ClassicDropdown, ClassicFilterRow, ClassicIconButton, ClassicPage, ClassicPagination,
  ClassicTable, ClassicTd, ClassicTfoot, ClassicTh, ClassicThead, ClassicToolbar, classicInputClass,
  classicLinkClass, classicMenuItemClass,
} from '@/skins/classic/components';

/** Legacy console lens colours: green capturing, orange running, red down. */
const LENS: Record<RuntimeTone, string> = {
  ok: 'bg-[#00c9a7]',
  warn: 'bg-amber-500',
  down: 'bg-[#ef4444]',
  unknown: 'bg-zinc-400',
};

/** Console — classic skin: the legacy `?view=console` table, verb for verb. */
export default function ClassicConsolePage() {
  const { t } = useTranslation();
  useDocumentTitle(t('Console'));
  const page = useClassicConsolePage();
  const [showFilters, setShowFilters] = useState(true);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  if (!page.isAuthenticated) return null;

  const {
    rows, allRows, total, totals, runtimeTotals, hasRuntime, names, columns, selectedIds,
    showId, showThumbs, showServer, showStorage, canEdit, sortMode,
  } = page;
  const visible = (k: ConsoleColumnKey): boolean => {
    if (k === 'id' && !showId) return false;
    if (k === 'thumbnail' && !showThumbs) return false;
    if (k === 'server' && !showServer) return false;
    if (k === 'storage' && !showStorage) return false;
    return columns.isVisible(k);
  };
  const hasSelection = selectedIds.size > 0;
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.monitor.id));
  const pct = (n: number) => (allRows.length ? ((n / allRows.length) * 100).toFixed(1) : '0');

  const toneLabel = (tone: RuntimeTone): string => {
    switch (tone) {
      case 'ok': return t('Capturing');
      case 'warn': return t('Not Capturing');
      case 'down': return t('Not Running');
      case 'unknown': return t('Unknown');
    }
  };

  const sortTh = (key: ConsoleSortKey, label: string, numeric = false, extra?: string) =>
    visible(key) ? (
      <ClassicTh
        key={key}
        numeric={numeric}
        onSort={() => page.toggleSort(key)}
        sortActive={page.sortKey === key}
        sortDir={page.sortDir}
        className={extra}
      >
        {label}
      </ClassicTh>
    ) : null;

  const dropOn = (targetId: number) => {
    if (draggingId == null || draggingId === targetId) return;
    const ids = allRows.map((r) => r.monitor.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = ids.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDraggingId(null);
    page.reorder(next);
  };

  const visibleCount = CONSOLE_COLUMNS.filter(visible).length + (canEdit ? 1 : 0);

  return (
    <AppShell title={t('Console')}>
      <ClassicPage>
        {showFilters && (
          <ClassicFilterRow monitors={page.data.monitors} state={page.filter} className="mb-2" />
        )}

        <ClassicToolbar
          label={t('Console actions')}
          end={
            <>
              <input
                type="search"
                value={page.search}
                onChange={(e) => page.setSearch(e.target.value)}
                placeholder={t('Search')}
                aria-label={t('Search monitors')}
                className={clsx(classicInputClass, 'w-44 py-1')}
              />
              <ClassicIconButton aria-label={t('Refresh')} onClick={page.refresh}>
                <RefreshCw size={14} aria-hidden />
              </ClassicIconButton>
              <ClassicDropdown label={t('Columns')} icon={<Columns3 size={14} aria-hidden />}>
                {CONSOLE_COLUMNS.map((key) => (
                  <label key={key} className={clsx(classicMenuItemClass, 'flex items-center gap-2 cursor-pointer')} role="menuitemcheckbox" aria-checked={columns.isVisible(key)}>
                    <input type="checkbox" checked={columns.isVisible(key)} onChange={() => columns.toggle(key)} />
                    {consoleColumnLabel(t, key)}
                  </label>
                ))}
                <button type="button" role="menuitem" className={clsx(classicMenuItemClass, 'border-t border-zinc-200 mt-1')} onClick={columns.reset}>
                  {t('Reset columns')}
                </button>
              </ClassicDropdown>
              <ClassicDropdown label={t('Export')} icon={<Download size={14} aria-hidden />}>
                <button type="button" role="menuitem" className={classicMenuItemClass} onClick={() => page.exportRows('csv')}>{t('Export CSV')}</button>
                <button type="button" role="menuitem" className={classicMenuItemClass} onClick={() => page.exportRows('json')}>{t('Export JSON')}</button>
              </ClassicDropdown>
              <ClassicIconButton aria-label={t('Reset sort order')} onClick={page.resetSort}>
                <ArrowDownUp size={14} aria-hidden />
              </ClassicIconButton>
            </>
          }
        >
          {hasRuntime && (
            <span className="text-sm text-zinc-800 me-1" data-testid="console-status-pills">
              {(['down', 'warn', 'ok', 'unknown'] as RuntimeTone[])
                .filter((tone) => runtimeTotals.byTone[tone] > 0)
                .map((tone) => (
                  <span key={tone} className="me-2 inline-flex items-center gap-1">
                    <span className={clsx('w-2 h-2 rounded-full', LENS[tone])} aria-hidden />
                    {toneLabel(tone)} {pct(runtimeTotals.byTone[tone])}%
                  </span>
                ))}
            </span>
          )}
          <RequirePerm feature="monitors" level="Edit">
            <ScanNetworkButton />
            <ClassicButton tone="primary" icon={<Plus size={14} />} onClick={page.openAdd}>{t('Add')}</ClassicButton>
            <ClassicButton icon={<Copy size={14} />} disabled={!hasSelection || page.busy} onClick={page.cloneSelected}>{t('Clone')}</ClassicButton>
            <ClassicButton icon={<Pencil size={14} />} disabled={!hasSelection} onClick={page.editSelected}>{t('Edit')}</ClassicButton>
            <ClassicButton icon={<Trash2 size={14} />} disabled={!hasSelection || page.busy} onClick={page.deleteSelected}>{t('Delete')}</ClassicButton>
            <ClassicButton icon={<ListChecks size={14} />} disabled={!hasSelection} onClick={page.openBulk}>{t('Select')}</ClassicButton>
            <ClassicButton tone={sortMode ? 'primary' : 'default'} icon={<ArrowDownUp size={14} />} aria-pressed={sortMode} onClick={page.toggleSortMode} title={t('Drag rows to change the sequence')}>
              {t('Sort')}
            </ClassicButton>
          </RequirePerm>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-pressed={showFilters}
            aria-label={showFilters ? t('Hide filters') : t('Show filters')}
            title={showFilters ? t('Hide filters') : t('Show filters')}
            className="p-1 text-[#337ab7] hover:text-[#23527c]"
          >
            {showFilters ? <FilterX size={18} aria-hidden /> : <Filter size={18} aria-hidden />}
          </button>
        </ClassicToolbar>

        <QueryState
          isLoading={page.isLoading}
          isError={page.isError}
          error={page.error}
          onRetry={page.data.refetch}
          empty={total === 0}
          emptyMessage={t('No matching records found')}
        >
          <ClassicTable aria-label={t('Monitors')} data-testid="console-classic-table">
            <ClassicThead>
              <tr>
                {canEdit && (
                  <ClassicTh className="w-8">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={page.toggleAllOnPage}
                      aria-label={t('Select all monitors on this page')}
                    />
                  </ClassicTh>
                )}
                {sortTh('id', t('Id'))}
                {visible('thumbnail') && <ClassicTh>{t('Thumbnail')}</ClassicTh>}
                {sortTh('name', t('Name'))}
                {sortTh('manufacturer', t('Manufacturer'))}
                {sortTh('model', t('Model'))}
                {sortTh('function', t('Function'))}
                {sortTh('server', t('Server'))}
                {sortTh('source', t('Source'))}
                {sortTh('storage', t('Storage'))}
                {sortTh('events', t('Events'), true)}
                {sortTh('hour', t('Hour'), true)}
                {sortTh('day', t('Day'), true)}
                {sortTh('week', t('Week'), true)}
                {sortTh('month', t('Month'), true)}
                {sortTh('archived', t('Archived'), true)}
                {sortTh('zones', t('Zones'), true)}
                {sortTh('sequence', t('Sequence'), true)}
              </tr>
            </ClassicThead>
            <tbody>
              {rows.map((row) => (
                <ConsoleTableRow
                  key={row.monitor.id}
                  row={row}
                  page={page}
                  visible={visible}
                  names={names}
                  dragEnabled={sortMode && canEdit}
                  isDragging={draggingId === row.monitor.id}
                  onDragStart={() => setDraggingId(row.monitor.id)}
                  onDragEnd={() => setDraggingId(null)}
                  onDrop={() => dropOn(row.monitor.id)}
                />
              ))}
            </tbody>
            <ClassicTfoot>
              <tr>
                {canEdit && <ClassicTd />}
                {visible('id') && <ClassicTd className="whitespace-nowrap">{t('Total: {{count}}', { count: total })}</ClassicTd>}
                {visible('thumbnail') && <ClassicTd />}
                {visible('name') && <ClassicTd />}
                {visible('manufacturer') && <ClassicTd />}
                {visible('model') && <ClassicTd />}
                {visible('function') && (
                  <ClassicTd className="text-center whitespace-nowrap" data-testid="console-runtime-totals">
                    {hasRuntime && (
                      <>
                        {formatBandwidthLegacy(runtimeTotals.bandwidth)}{' '}
                        {formatFpsLegacy(runtimeTotals.captureFps)} / {formatFpsLegacy(runtimeTotals.analysisFps)}
                      </>
                    )}
                  </ClassicTd>
                )}
                {visible('server') && <ClassicTd />}
                {visible('source') && <ClassicTd />}
                {visible('storage') && <ClassicTd />}
                {visible('events') && <FootCount count={totals.events.count} disk={totals.events.disk} />}
                {visible('hour') && <FootCount count={totals.hour.count} disk={totals.hour.disk} />}
                {visible('day') && <FootCount count={totals.day.count} disk={totals.day.disk} />}
                {visible('week') && <FootCount count={totals.week.count} disk={totals.week.disk} />}
                {visible('month') && <FootCount count={totals.month.count} disk={totals.month.disk} />}
                {visible('archived') && <FootCount count={totals.archived.count} disk={totals.archived.disk} />}
                {visible('zones') && <ClassicTd numeric className={classicLinkClass}>{totals.zones}</ClassicTd>}
                {visible('sequence') && <ClassicTd />}
              </tr>
            </ClassicTfoot>
          </ClassicTable>
          {visibleCount === 0 && <p className="text-sm text-zinc-500 mt-2">{t('Every column is hidden.')}</p>}
        </QueryState>

        <ClassicPagination
          page={page.page}
          pageSize={page.pageSize}
          total={total}
          onPage={page.setPage}
          onPageSize={page.setPageSize}
        />
      </ClassicPage>

      <AddMonitorDialog open={page.addOpen} onClose={page.closeAdd} />
      <BulkModeDialog
        open={page.bulkOpen}
        count={selectedIds.size}
        busy={page.busy}
        onClose={page.closeBulk}
        onApply={page.applyBulk}
      />
    </AppShell>
  );
}

/* ------------------------------------------------------------------------ */

function ConsoleTableRow({
  row, page, visible, names, dragEnabled, isDragging, onDragStart, onDragEnd, onDrop,
}: {
  row: ConsoleRow;
  page: ClassicConsolePageState;
  visible: (k: ConsoleColumnKey) => boolean;
  names: ClassicConsolePageState['names'];
  dragEnabled: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const { t } = useTranslation();
  const { monitor: m, summary: s, runtime } = row;
  const isActive = m.capturing !== 'None';
  const tone: RuntimeTone = isActive ? runtimeTone(runtime?.status) : 'down';
  const watchParams = { monitorId: String(m.id) };
  const lines = functionLines(m);

  const dragProps = dragEnabled ? {
    draggable: true,
    onDragStart: (e: DragEvent<HTMLTableRowElement>) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(m.id));
      onDragStart();
    },
    onDragOver: (e: DragEvent<HTMLTableRowElement>) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; },
    onDrop: (e: DragEvent<HTMLTableRowElement>) => { e.preventDefault(); onDrop(); },
    onDragEnd,
  } : {};

  return (
    <tr
      className={clsx(isDragging && 'opacity-40', dragEnabled && 'cursor-grab')}
      data-testid={`console-row-${m.id}`}
      {...dragProps}
    >
      {page.canEdit && (
        <ClassicTd>
          <input
            type="checkbox"
            checked={page.selectedIds.has(m.id)}
            onChange={() => page.toggleSelected(m.id)}
            aria-label={t('Select {{name}}', { name: m.name })}
          />
        </ClassicTd>
      )}
      {visible('id') && (
        <ClassicTd className="text-center">
          <Link to="/monitors/$monitorId" params={watchParams} className={classicLinkClass}>{m.id}</Link>
        </ClassicTd>
      )}
      {visible('thumbnail') && (
        <ClassicTd className="text-center">
          {isActive ? (
            <Link to="/monitors/$monitorId" params={watchParams} className="inline-block" aria-label={t('Watch {{name}}', { name: m.name })}>
              <span className="relative block w-12 h-12 bg-zinc-200 overflow-hidden">
                <MonitorPreview monitorId={m.id} monitorName={m.name} orientation={m.orientation} isActive compact rotationFit="fit" />
              </span>
            </Link>
          ) : null}
        </ClassicTd>
      )}
      {visible('name') && (
        <ClassicTd>
          <Link to="/monitors/$monitorId" params={watchParams} className={clsx(classicLinkClass, 'inline-flex items-center gap-2')}>
            <span
              className={clsx('w-4 h-4 rounded-full shrink-0', LENS[tone])}
              role="img"
              aria-label={isActive ? (runtime?.status ?? t('Unknown')) : t('Not Running')}
              title={runtime?.status}
            />
            {m.name}
          </Link>
        </ClassicTd>
      )}
      {visible('manufacturer') && <ClassicTd>{names.manufacturerName(m.manufacturer_id) || '—'}</ClassicTd>}
      {visible('model') && <ClassicTd>{names.modelName(m.model_id) || '—'}</ClassicTd>}
      {visible('function') && (
        <ClassicTd className="text-center">
          {lines.map((l) => <div key={l}>{l}</div>)}
          {isActive && runtime && (
            <div className="text-[11px] text-zinc-600 mt-1 tabular-nums" data-testid={`console-runtime-${m.id}`}>
              {formatFpsLegacy(runtime.captureFpsRaw)} {formatBandwidthLegacy(runtime.bandwidth)}
            </div>
          )}
        </ClassicTd>
      )}
      {visible('server') && <ClassicTd>{names.serverName(m.server_id) || '—'}</ClassicTd>}
      {visible('source') && (
        <ClassicTd>
          <Link to="/monitors/$monitorId" params={watchParams} search={{ edit: true }} className={classicLinkClass}>
            {monitorSource(m) || t('({{count}})', { count: m.id })}
          </Link>
          <div className={clsx('text-[13px]', isActive ? 'text-[#2ab5d6]' : 'text-red-600')}>
            {m.width}x{m.height}
          </div>
        </ClassicTd>
      )}
      {visible('storage') && <ClassicTd>{names.storageName(m.storage_id) || m.storage_id}</ClassicTd>}
      {visible('events') && <CountCell monitorId={m.id} count={s.total_events} disk={s.total_event_disk_space} />}
      {visible('hour') && <CountCell monitorId={m.id} count={s.hour_events} disk={s.hour_event_disk_space} />}
      {visible('day') && <CountCell monitorId={m.id} count={s.day_events} disk={s.day_event_disk_space} />}
      {visible('week') && <CountCell monitorId={m.id} count={s.week_events} disk={s.week_event_disk_space} />}
      {visible('month') && <CountCell monitorId={m.id} count={s.month_events} disk={s.month_event_disk_space} />}
      {visible('archived') && <CountCell monitorId={m.id} count={s.archived_events} disk={s.archived_event_disk_space} archived />}
      {visible('zones') && (
        <ClassicTd numeric>
          <Link to="/monitors/$monitorId/zones" params={watchParams} className={classicLinkClass}>{m.zone_count ?? 0}</Link>
        </ClassicTd>
      )}
      {visible('sequence') && <ClassicTd numeric>{m.sequence ?? '—'}</ClassicTd>}
    </tr>
  );
}

function CountCell({ monitorId, count, disk, archived }: { monitorId: number; count: number; disk: number; archived?: boolean }) {
  return (
    <ClassicTd numeric>
      <Link
        to="/events"
        search={archived ? { monitor_id: monitorId, archived: true } : { monitor_id: monitorId }}
        className={classicLinkClass}
      >
        {count}
      </Link>
      {/* `null` is the literal string ZoneMinder prints: `SUM(DiskSpace)` is
          NULL for a monitor with no events and legacy interpolates it
          straight in. Zero is a different case and prints `0.00B` — checked
          on 1.39.16, where a monitor with 3 events and no bytes reads
          `3 / 0.00B`. Faithful, not a bug: don't "fix" either to an em dash
          without changing legacy too. */}
      <div className="text-[11px] text-zinc-500">{humanFilesize(count > 0 ? disk : null)}</div>
    </ClassicTd>
  );
}

function FootCount({ count, disk }: { count: number; disk: number }) {
  return (
    <ClassicTd numeric>
      <span className={classicLinkClass}>{count}</span>
      <div className="text-[11px] font-normal text-zinc-500">{humanFilesize(count > 0 ? disk : null)}</div>
    </ClassicTd>
  );
}
