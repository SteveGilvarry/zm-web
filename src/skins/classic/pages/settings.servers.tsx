import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';

import { AppShell } from '@/skins/AppShell';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Modal } from '@/components/common/Modal';
import { QueryState } from '@/components/common/QueryState';
import { usePerms } from '@/features/auth/usePerms';
import type { Server } from '@/api/servers';
import { useServersPage, type ServerRow } from '@/features/servers/useServersPage';
import { SERVER_PROTOCOLS, SERVER_STATUSES, useServerForm } from '@/features/servers/useServerForm';
import { SERVER_DAEMONS, serverDaemonLabels } from '@/features/servers/serverFields';
import { CPU_LOAD_ERROR, serverStatusTone, type LoadTone, type ServerLoadSummary } from '@/features/servers/serverStats';
import { humanFilesize } from '@/lib/format';
import { useOptionsTabs } from '@/features/settings/useOptionsTabs';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { OptionsRail } from '../components/settings/OptionsRail';
import { ClassicButton, ClassicTable, classicInput, classicLink, classicTd, classicTh } from '../components/settings/primitives';

const input = classicInput;

/** Mark, Id, Name, Url, three paths, Status, Monitors, load, memory, swap, four daemon flags. */
const COLUMN_COUNT = 16;

/**
 * Options → Servers — classic skin, legacy `_options_servers.php`: Add New
 * Server and Delete over the table, a Mark column, and every cell a link
 * that opens the server modal for an editor.
 */
export default function ClassicSettingsServersPage() {
  const { t, i18n } = useTranslation();
  const s = useServersPage();
  const tabs = useOptionsTabs();
  const { can } = usePerms();
  useSiteTitle(t('Servers'));
  const canEdit = can('system', 'Edit');
  const daemonLabels = serverDaemonLabels(t);

  if (!s.isAuthenticated) return null;

  const num = (v: number | null) =>
    v == null ? '—' : v.toLocaleString(i18n.language, { maximumFractionDigits: 2 });

  return (
    <AppShell title={t('Servers')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <h1 className="text-xl text-zinc-800 font-semibold">{t('Options')}</h1>
          <div className="flex items-start gap-4">
            <OptionsRail tabs={tabs} active="servers" />
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex items-center gap-2">
                <ClassicButton onClick={s.openCreate} disabled={!canEdit}>{t('Add New Server')}</ClassicButton>
                <ClassicButton tone="danger" onClick={s.requestDeleteMarked} disabled={!canEdit || s.selectedIds.size === 0}>
                  {t('Delete')}
                </ClassicButton>
              </div>
              {s.statsError && (
                <p role="alert" className="text-xs text-amber-700">
                  {t('Load columns unavailable: {{message}}', { message: s.statsError })}
                </p>
              )}
              <QueryState
                isLoading={s.isLoading}
                isError={s.isError}
                error={s.error}
                onRetry={s.refetch}
                empty={s.rows.length === 0 && !s.localLoad}
                emptyMessage={t('No servers registered. The default install is single-node.')}
              >
                <ClassicTable>
                  <thead>
                    <tr>
                      <th className={clsx(classicTh, 'w-8')}>
                        <input
                          type="checkbox"
                          aria-label={t('Select all')}
                          disabled={!canEdit || s.rows.length === 0}
                          checked={s.rows.length > 0 && s.selectedIds.size === s.rows.length}
                          onChange={s.toggleAll}
                        />
                      </th>
                      <th className={clsx(classicTh, 'text-end')}>{t('Id')}</th>
                      <th className={classicTh}>{t('Name')}</th>
                      <th className={classicTh}>{t('Url')}</th>
                      <th className={classicTh}>{t('Path to index')}</th>
                      <th className={classicTh}>{t('Path to ZMS')}</th>
                      <th className={classicTh}>{t('Path to API')}</th>
                      <th className={classicTh}>{t('Status')}</th>
                      <th className={clsx(classicTh, 'text-end')}>{t('Monitors')}</th>
                      <th className={clsx(classicTh, 'text-end')}>{t('CPU Load')}</th>
                      <th className={clsx(classicTh, 'text-end')}>{t('Free/Total Memory')}</th>
                      <th className={clsx(classicTh, 'text-end')}>{t('Free/Total Swap')}</th>
                      {SERVER_DAEMONS.map((d) => (
                        <th key={d} className={classicTh}>{daemonLabels[d]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.length === 0 && (
                      <tr>
                        <td colSpan={COLUMN_COUNT} className={clsx(classicTd, 'py-6 text-center text-zinc-500')}>
                          {t('No servers registered. The default install is single-node.')}
                        </td>
                      </tr>
                    )}
                    {s.rows.map((row) => (
                      <ServerTableRow
                        key={row.server.id}
                        row={row}
                        num={num}
                        canEdit={canEdit}
                        marked={s.selectedIds.has(row.server.id)}
                        onMark={() => s.toggleSelected(row.server.id)}
                        onEdit={() => s.startEdit(row.server)}
                      />
                    ))}
                    {s.localLoad && (
                      <tr className="text-zinc-600">
                        <td className={classicTd} />
                        <td className={clsx(classicTd, 'italic')} colSpan={7}>
                          {t('This host')}
                          <span className="ms-1 text-[10px] not-italic text-zinc-400">
                            ({t('stats recorded without a server id')})
                          </span>
                        </td>
                        <td className={clsx(classicTd, 'text-end')}>—</td>
                        <LoadTds load={s.localLoad} num={num} />
                        {SERVER_DAEMONS.map((d) => <td key={d} className={classicTd}>—</td>)}
                      </tr>
                    )}
                  </tbody>
                </ClassicTable>
              </QueryState>
            </div>
          </div>
        </div>
      </main>

      <Modal
        isOpen={s.formOpen && canEdit}
        onClose={s.cancelEdit}
        title={s.editing ? t('Server - {{name}}', { name: s.editing.name }) : t('New Server')}
      >
        <ServerForm key={s.editing?.id ?? 'new'} editing={s.editing} onSaved={s.onSaved} onCancel={s.cancelEdit} />
      </Modal>

      <ConfirmDialog
        isOpen={!!s.deleteTarget || s.deleteMarked}
        onClose={s.cancelDelete}
        onConfirm={s.confirmDelete}
        title={t('Delete server')}
        message={s.deleteTarget
          ? t('Delete server "{{name}}"?', { name: s.deleteTarget.name })
          : t('Delete {{count}} marked server?', { count: s.selectedIds.size })}
        confirmText={t('Delete')}
        variant="danger"
        isLoading={s.isDeleting}
      />
    </AppShell>
  );
}

type Num = (v: number | null) => string;

/** One legacy server row: every cell opens the server modal for an editor. */
function ServerTableRow({ row, num, canEdit, marked, onMark, onEdit }: {
  row: ServerRow;
  num: Num;
  canEdit: boolean;
  marked: boolean;
  onMark: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const { server, monitorCount, load, url } = row;
  const mono = clsx(classicTd, 'font-mono text-xs');
  const cell = (content: ReactNode) =>
    canEdit ? <button type="button" onClick={onEdit} className={clsx(classicLink, 'text-start')}>{content}</button> : content;

  return (
    <tr>
      <td className={classicTd}>
        <input
          type="checkbox"
          aria-label={t('Mark {{name}}', { name: server.name })}
          checked={marked}
          disabled={!canEdit}
          onChange={onMark}
        />
      </td>
      <td className={clsx(mono, 'text-end tabular-nums')}>{cell(server.id)}</td>
      <td className={classicTd}>{cell(server.name)}</td>
      <td className={mono}>{cell(url ?? '')}</td>
      <td className={mono}>{cell(server.path_to_index || '')}</td>
      <td className={mono}>{cell(server.path_to_zms || '')}</td>
      <td className={mono}>{cell(server.path_to_api || '')}</td>
      <td className={clsx(classicTd, 'text-xs')}>{cell(<StatusText status={server.status} />)}</td>
      <td className={clsx(classicTd, 'text-end font-mono tabular-nums')}>{cell(monitorCount)}</td>
      <LoadTds load={load} num={num} />
      {row.daemons.map(({ daemon, enabled }) => (
        <td key={daemon} className={clsx(classicTd, 'text-xs')}>{cell(enabled ? t('yes') : t('no'))}</td>
      ))}
    </tr>
  );
}

/** Legacy paints CpuLoad > 5 and free mem/swap under 10 % (or no total) red. */
const TONE_CLS: Record<LoadTone, string> = {
  ok: '',
  warn: 'text-amber-700',
  error: 'text-red-700 font-semibold',
  none: 'text-zinc-400',
};

/** `human_filesize(free) / human_filesize(total)`; red when the total is unknown or free is under 10 %. */
function freeTotal(free: number | null, total: number | null): { text: string; tone: LoadTone } {
  if (free == null && total == null) return { text: '—', tone: 'none' };
  const tone: LoadTone = !total || (free ?? 0) / total < 0.1 ? 'error' : 'ok';
  return { text: `${humanFilesize(free ?? 0)} / ${humanFilesize(total ?? 0)}`, tone };
}

function LoadTds({ load, num }: { load: ServerLoadSummary | null; num: Num }) {
  const cell = clsx(classicTd, 'text-end font-mono tabular-nums whitespace-nowrap');
  const cpuLoad = load?.cpuLoad ?? null;
  const cpuTone: LoadTone = cpuLoad == null ? 'none' : cpuLoad > CPU_LOAD_ERROR ? 'error' : 'ok';
  const mem = freeTotal(load?.freeMem ?? null, load?.totalMem ?? null);
  const swap = freeTotal(load?.freeSwap ?? null, load?.totalSwap ?? null);
  return (
    <>
      <td className={clsx(cell, TONE_CLS[cpuTone])} data-tone={cpuTone}>{num(cpuLoad)}</td>
      <td className={clsx(cell, TONE_CLS[mem.tone])} data-tone={mem.tone}>{mem.text}</td>
      <td className={clsx(cell, TONE_CLS[swap.tone])} data-tone={swap.tone}>{swap.text}</td>
    </>
  );
}

function StatusText({ status }: { status: string }) {
  const { t } = useTranslation();
  const tone = serverStatusTone(status);
  return (
    <span className={clsx('font-semibold', tone === 'ok' ? 'text-green-700' : tone === 'down' ? 'text-red-700' : 'text-zinc-500')}>
      {tone === 'ok' ? t('Running') : tone === 'down' ? t('Not running') : t('Unknown')}
    </span>
  );
}

function ServerForm({ editing, onSaved, onCancel }: { editing: Server | null; onSaved: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const f = useServerForm(editing, onSaved);
  const daemonLabels = serverDaemonLabels(t);

  /* Legacy's Servers modal, row for row (`web/ajax/modals/server.php`):
     Name, Protocol, Hostname, Port, PathToIndex, PathToZMS, PathToApi and the
     four Yes/No daemon flags. Status and the coordinates are extra — the row
     carries them and the API accepts them, legacy's modal just omits them. */
  return (
    <form onSubmit={f.submit} className="space-y-2">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center text-sm max-w-xl">
        <label htmlFor="srv-name" className="text-zinc-700">{t('Name')}</label>
        <input id="srv-name" value={f.name} onChange={(e) => f.setName(e.target.value)} className={input} placeholder={t('e.g. zm-edge-01')} />

        <label htmlFor="srv-protocol" className="text-zinc-700">{t('Protocol')}</label>
        <select id="srv-protocol" value={f.protocol} onChange={(e) => f.setProtocol(e.target.value)} className={input}>
          <option value="">{t('Not set')}</option>
          {SERVER_PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        <label htmlFor="srv-host" className="text-zinc-700">{t('Hostname')}</label>
        <div className="flex gap-2">
          <input id="srv-host" value={f.text.hostname} onChange={(e) => f.setTextField('hostname', e.target.value)} className={clsx(input, 'flex-1 font-mono')} placeholder={t('hostname or IP')} />
          <input aria-label={t('Port')} value={f.port} onChange={(e) => f.setPort(e.target.value)} className={clsx(input, 'w-20 font-mono')} placeholder={t('port')} />
        </div>

        <label htmlFor="srv-index" className="text-zinc-700">{t('Path to index')}</label>
        <input id="srv-index" value={f.text.path_to_index} onChange={(e) => f.setTextField('path_to_index', e.target.value)} className={clsx(input, 'font-mono')} placeholder="/zm/index.php" />

        <label htmlFor="srv-zms" className="text-zinc-700">{t('Path to ZMS')}</label>
        <input id="srv-zms" value={f.text.path_to_zms} onChange={(e) => f.setTextField('path_to_zms', e.target.value)} className={clsx(input, 'font-mono')} placeholder="/zm/cgi-bin/nph-zms" />

        <label htmlFor="srv-api" className="text-zinc-700">{t('Path to API')}</label>
        <input id="srv-api" value={f.text.path_to_api} onChange={(e) => f.setTextField('path_to_api', e.target.value)} className={clsx(input, 'font-mono')} placeholder="/zm/api" />

        <label htmlFor="srv-status" className="text-zinc-700">{t('Status')}</label>
        <select id="srv-status" value={f.status} onChange={(e) => f.setStatus(e.target.value)} className={input}>
          {SERVER_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
        </select>

        <span className="text-zinc-700">{t('Coordinates')}</span>
        <div className="flex gap-2">
          <input aria-label={t('Latitude')} value={f.latitude} onChange={(e) => f.setLatitude(e.target.value)} className={clsx(input, 'w-28 font-mono')} placeholder={t('latitude')} />
          <input aria-label={t('Longitude')} value={f.longitude} onChange={(e) => f.setLongitude(e.target.value)} className={clsx(input, 'w-28 font-mono')} placeholder={t('longitude')} />
        </div>

        {SERVER_DAEMONS.map((daemon) => (
          <Fragment key={daemon}>
            <label htmlFor={`srv-${daemon}`} className="text-zinc-700">{daemonLabels[daemon]}</label>
            <input
              id={`srv-${daemon}`}
              type="checkbox"
              checked={f.daemons[daemon]}
              onChange={(e) => f.setDaemon(daemon, e.target.checked)}
              className="justify-self-start"
            />
          </Fragment>
        ))}
      </div>
      {f.error && <p role="alert" className="text-xs text-red-700">{t('Save failed: {{message}}', { message: f.error })}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <ClassicButton type="submit" tone="primary" disabled={f.submitDisabled}>{t('Save')}</ClassicButton>
        <ClassicButton onClick={onCancel}>{t('Cancel')}</ClassicButton>
      </div>
    </form>
  );
}
