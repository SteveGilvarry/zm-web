import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';

import { AppShell } from '@/skins/AppShell';
import type { Server } from '@/api/servers';
import { useServersPage } from '@/features/servers/useServersPage';
import { SERVER_STATUSES, useServerForm } from '@/features/servers/useServerForm';
import { serverStatusTone, type ServerLoadSummary } from '@/features/servers/serverStats';
import { useOptionsTabs } from '@/features/settings/useOptionsTabs';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { OptionsRail } from '../components/settings/OptionsRail';

const btn = 'px-2 py-0.5 text-xs border border-zinc-500 rounded-sm bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40';
const input = 'px-2 py-1 text-sm bg-white border border-zinc-400 rounded-sm text-zinc-900 focus:outline-none focus:border-zinc-600';

/** Options → Servers — classic skin: legacy server table with load columns. */
export default function ClassicSettingsServersPage() {
  const { t, i18n } = useTranslation();
  const s = useServersPage();
  const tabs = useOptionsTabs();
  useDocumentTitle(t('Servers'));

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
              <div className="bg-white rounded border border-zinc-300 overflow-hidden">
                <table className="w-full text-sm text-zinc-800">
                  <thead className="bg-zinc-100 border-b border-zinc-300 text-xs">
                    <tr>
                      <th className="px-3 py-2 text-start font-semibold">{t('Name')}</th>
                      <th className="px-3 py-2 text-start font-semibold">{t('Host')}</th>
                      <th className="px-3 py-2 text-start font-semibold">{t('Status')}</th>
                      <th className="px-3 py-2 text-end font-semibold">{t('Monitors')}</th>
                      <th className="px-3 py-2 text-end font-semibold">{t('Load')}</th>
                      <th className="px-3 py-2 text-end font-semibold">{t('CPU')}</th>
                      <th className="px-3 py-2 text-end font-semibold">{t('Memory')}</th>
                      <th className="px-3 py-2 text-end font-semibold">{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-6 text-center text-zinc-500">
                          {t('No servers registered. The default install is single-node.')}
                        </td>
                      </tr>
                    )}
                    {s.rows.map(({ server, monitorCount, load }) => (
                      <tr key={server.id} className="border-b border-zinc-200 hover:bg-zinc-50">
                        <td className="px-3 py-1.5">
                          <button type="button" onClick={() => s.startEdit(server)} className="text-cyan-800 hover:underline">
                            {server.name}
                          </button>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs">
                          {server.hostname}{server.port != null ? `:${server.port}` : ''}
                        </td>
                        <td className="px-3 py-1.5 text-xs"><StatusText status={server.status} /></td>
                        <td className="px-3 py-1.5 text-end font-mono tabular-nums">{monitorCount}</td>
                        <LoadTds load={load} pct={pct} />
                        <td className="px-3 py-1.5 text-end whitespace-nowrap">
                          <button type="button" onClick={() => s.startEdit(server)} aria-label={t('Edit {{name}}', { name: server.name })} className={btn}>{t('Edit')}</button>{' '}
                          <button type="button" onClick={() => s.confirmDelete(server)} aria-label={t('Delete {{name}}', { name: server.name })} className={btn}>{t('Delete')}</button>
                        </td>
                      </tr>
                    ))}
                    {s.localLoad && (
                      <tr className="border-t border-zinc-300 bg-zinc-50 text-zinc-600">
                        <td className="px-3 py-1.5 italic" colSpan={3}>
                          {t('This host')}
                          <span className="ms-1 text-[10px] not-italic text-zinc-400">
                            ({t('stats recorded without a server id')})
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-end">—</td>
                        <LoadTds load={s.localLoad} pct={pct} />
                        <td />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <ServerForm key={s.editing?.id ?? 'new'} editing={s.editing} onSaved={s.onSaved} onCancel={s.cancelEdit} />
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}

function LoadTds({ load, pct }: { load: ServerLoadSummary | null; pct: (v: number | null, suffix?: string) => string }) {
  const cell = 'px-3 py-1.5 text-end font-mono tabular-nums';
  return (
    <>
      <td className={cell}>{pct(load?.cpuLoad ?? null)}</td>
      <td className={cell}>{pct(load?.cpuPercent ?? null, '%')}</td>
      <td className={cell}>{pct(load?.memPercent ?? null, '%')}</td>
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
        <button type="submit" disabled={f.submitDisabled} className={btn}>{editing ? t('Save') : t('Register')}</button>
        {editing && <button type="button" onClick={onCancel} className={btn}>{t('Cancel')}</button>}
      </div>
    </form>
  );
}
