import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';

import { AppShell } from '@/skins/AppShell';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import type { Server } from '@/api/servers';
import { useServersPage } from '@/features/servers/useServersPage';
import { SERVER_STATUSES, useServerForm } from '@/features/servers/useServerForm';
import { cpuLoadTone, freeTone, serverStatusTone, type LoadTone, type ServerLoadSummary } from '@/features/servers/serverStats';
import { useOptionsTabs } from '@/features/settings/useOptionsTabs';
import { useSiteTitle } from '@/features/settings/useSiteTitle';
import { OptionsRail } from '../components/settings/OptionsRail';
import { ClassicButton, ClassicTable, classicInput, classicLink, classicTd, classicTh } from '../components/settings/primitives';

const input = classicInput;

/** Options → Servers — classic skin: legacy server table with load columns. */
export default function ClassicSettingsServersPage() {
  const { t, i18n } = useTranslation();
  const s = useServersPage();
  const tabs = useOptionsTabs();
  const { can } = usePerms();
  useSiteTitle(t('Servers'));
  const canEdit = can('system', 'Edit');

  if (!s.isAuthenticated) return null;

  const pct = (v: number | null, suffix = '') =>
    v == null ? '—' : `${v.toLocaleString(i18n.language, { maximumFractionDigits: 1 })}${suffix}`;

  return (
    <AppShell title={t('Servers')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <h1 className="text-xl text-zinc-800 font-semibold">{t('Options')}</h1>
          <div className="flex items-start gap-4">
            <OptionsRail tabs={tabs} active="servers" />
            <div className="flex-1 min-w-0 space-y-3">
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
                      <th className={classicTh}>{t('Name')}</th>
                      <th className={classicTh}>{t('Host')}</th>
                      <th className={classicTh}>{t('Status')}</th>
                      <th className={clsx(classicTh, 'text-end')}>{t('Monitors')}</th>
                      <th className={clsx(classicTh, 'text-end')}>{t('Load')}</th>
                      <th className={clsx(classicTh, 'text-end')}>{t('CPU')}</th>
                      <th className={clsx(classicTh, 'text-end')}>{t('Free mem')}</th>
                      <th className={clsx(classicTh, 'text-end')}>{t('Free swap')}</th>
                      <th className={clsx(classicTh, 'text-end')}>{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.length === 0 && (
                      <tr>
                        <td colSpan={9} className={clsx(classicTd, 'py-6 text-center text-zinc-500')}>
                          {t('No servers registered. The default install is single-node.')}
                        </td>
                      </tr>
                    )}
                    {s.rows.map(({ server, monitorCount, load }) => (
                      <tr key={server.id}>
                        <td className={classicTd}>
                          {canEdit ? (
                            <button type="button" onClick={() => s.startEdit(server)} className={classicLink}>
                              {server.name}
                            </button>
                          ) : server.name}
                        </td>
                        <td className={clsx(classicTd, 'font-mono text-xs')}>
                          {server.hostname}{server.port != null ? `:${server.port}` : ''}
                        </td>
                        <td className={clsx(classicTd, 'text-xs')}><StatusText status={server.status} /></td>
                        <td className={clsx(classicTd, 'text-end font-mono tabular-nums')}>{monitorCount}</td>
                        <LoadTds load={load} pct={pct} />
                        <td className={clsx(classicTd, 'text-end whitespace-nowrap')}>
                          <RequirePerm feature="system" level="Edit">
                            <ClassicButton onClick={() => s.startEdit(server)} aria-label={t('Edit {{name}}', { name: server.name })}>{t('Edit')}</ClassicButton>{' '}
                            <ClassicButton onClick={() => s.requestDelete(server)} aria-label={t('Delete {{name}}', { name: server.name })}>{t('Delete')}</ClassicButton>
                          </RequirePerm>
                        </td>
                      </tr>
                    ))}
                    {s.localLoad && (
                      <tr className="text-zinc-600">
                        <td className={clsx(classicTd, 'italic')} colSpan={3}>
                          {t('This host')}
                          <span className="ms-1 text-[10px] not-italic text-zinc-400">
                            ({t('stats recorded without a server id')})
                          </span>
                        </td>
                        <td className={clsx(classicTd, 'text-end')}>—</td>
                        <LoadTds load={s.localLoad} pct={pct} />
                        <td className={classicTd} />
                      </tr>
                    )}
                  </tbody>
                </ClassicTable>
              </QueryState>

              <RequirePerm feature="system" level="Edit">
                <ServerForm key={s.editing?.id ?? 'new'} editing={s.editing} onSaved={s.onSaved} onCancel={s.cancelEdit} />
              </RequirePerm>
            </div>
          </div>
        </div>
      </main>

      <ConfirmDialog
        isOpen={!!s.deleteTarget}
        onClose={s.cancelDelete}
        onConfirm={s.confirmDelete}
        title={t('Delete server')}
        message={t('Delete server "{{name}}"?', { name: s.deleteTarget?.name })}
        confirmText={t('Delete')}
        variant="danger"
        isLoading={s.isDeleting}
      />
    </AppShell>
  );
}

/** Legacy `server.php` paints CpuLoad > 5 and free mem/swap < 10% red. */
const TONE_CLS: Record<LoadTone, string> = {
  ok: '',
  warn: 'text-amber-700',
  error: 'text-red-700 font-semibold',
  none: 'text-zinc-400',
};

function LoadTds({ load, pct }: { load: ServerLoadSummary | null; pct: (v: number | null, suffix?: string) => string }) {
  const cell = clsx(classicTd, 'text-end font-mono tabular-nums');
  const cpuLoad = load?.cpuLoad ?? null;
  const memFree = load?.memFreePercent ?? null;
  const swapFree = load?.swapFreePercent ?? null;
  return (
    <>
      <td className={clsx(cell, TONE_CLS[cpuLoadTone(cpuLoad)])} data-tone={cpuLoadTone(cpuLoad)}>{pct(cpuLoad)}</td>
      <td className={cell}>{pct(load?.cpuPercent ?? null, '%')}</td>
      <td className={clsx(cell, TONE_CLS[freeTone(memFree)])} data-tone={freeTone(memFree)}>{pct(memFree, '%')}</td>
      <td className={clsx(cell, TONE_CLS[freeTone(swapFree)])} data-tone={freeTone(swapFree)}>{pct(swapFree, '%')}</td>
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
  return (
    <form onSubmit={f.submit} className="bg-white rounded border border-zinc-300 p-3 space-y-2">
      <h2 className="text-sm font-semibold text-zinc-800">
        {editing ? t('Edit server — {{name}}', { name: editing.name }) : t('New server')}
      </h2>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center text-sm max-w-xl">
        <label htmlFor="srv-name" className="text-zinc-700">{t('Name')}</label>
        <input id="srv-name" value={f.name} onChange={(e) => f.setName(e.target.value)} className={input} placeholder={t('e.g. zm-edge-01')} />
        <label htmlFor="srv-host" className="text-zinc-700">{t('Host')}</label>
        <div className="flex gap-2">
          <input id="srv-host" value={f.hostname} onChange={(e) => f.setHostname(e.target.value)} className={clsx(input, 'flex-1 font-mono')} placeholder={t('hostname or IP')} />
          <input aria-label={t('Port')} value={f.port} onChange={(e) => f.setPort(e.target.value)} className={clsx(input, 'w-20 font-mono')} placeholder={t('port')} />
        </div>
        <label htmlFor="srv-status" className="text-zinc-700">{t('Status')}</label>
        <select id="srv-status" value={f.status} onChange={(e) => f.setStatus(e.target.value)} className={input}>
          {SERVER_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
        </select>
      </div>
      {f.error && <p role="alert" className="text-xs text-red-700">{t('Save failed: {{message}}', { message: f.error })}</p>}
      <div className="flex gap-2">
        <ClassicButton type="submit" tone="primary" disabled={f.submitDisabled}>{editing ? t('Save') : t('Register')}</ClassicButton>
        {editing && <ClassicButton onClick={onCancel}>{t('Cancel')}</ClassicButton>}
      </div>
    </form>
  );
}
