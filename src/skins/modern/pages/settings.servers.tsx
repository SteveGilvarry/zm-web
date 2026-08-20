import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Server as ServerIcon, Plus, Trash2, Pencil, Save, X, Activity } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import type { Server } from '@/api/servers';
import { useServersPage } from '@/features/servers/useServersPage';
import { SERVER_STATUSES, useServerForm } from '@/features/servers/useServerForm';
import { serverStatusTone, type ServerLoadSummary } from '@/features/servers/serverStats';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/** Settings → Servers — Mission Control. */
export default function SettingsServersPage() {
  const { t } = useTranslation();
  const s = useServersPage();
  useDocumentTitle(t('Servers'));

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={t('Servers')}>
      <main className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-5 space-y-6">
            <Panel
              title={s.editing ? t('Edit server — {{name}}', { name: s.editing.name }) : t('New server')}
              icon={s.editing ? <Pencil size={16} /> : <Plus size={16} />}
              action={s.editing ? (
                <button
                  onClick={s.cancelEdit}
                  aria-label={t('Cancel edit')}
                  className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
                >
                  <X size={14} />
                </button>
              ) : undefined}
            >
              <ServerForm key={s.editing?.id ?? 'new'} editing={s.editing} onSaved={s.onSaved} />
            </Panel>

            {s.localLoad && (
              <Panel title={t('This host')} icon={<Activity size={16} />}>
                <p className="text-[11px] text-text-muted mb-2">
                  {t('Latest zmstats sample recorded without a server id — the single-node default.')}
                </p>
                <LoadCells load={s.localLoad} layout="inline" />
              </Panel>
            )}
          </div>

          <div className="col-span-7">
            <Panel title={t('Registered servers')} icon={<ServerIcon size={16} />} noPadding>
              {s.statsError && (
                <p role="alert" className="px-3 py-2 text-xs text-amber border-b border-border-subtle">
                  {t('Load columns unavailable: {{message}}', { message: s.statsError })}
                </p>
              )}
              {s.rows.length === 0 ? (
                <div className="py-10 text-center text-text-muted text-sm">
                  {t('No servers registered. The default install is single-node.')}
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-surface/70 border-b border-border-subtle text-[10px] uppercase tracking-wider text-text-muted">
                    <tr>
                      <th className="px-3 py-2 text-start">{t('Name')}</th>
                      <th className="px-3 py-2 text-start">{t('Host')}</th>
                      <th className="px-3 py-2 text-start">{t('Status')}</th>
                      <th className="px-3 py-2 text-end">{t('Monitors')}</th>
                      <th className="px-3 py-2 text-end">{t('Load')}</th>
                      <th className="px-3 py-2 text-end">{t('CPU')}</th>
                      <th className="px-3 py-2 text-end">{t('Memory')}</th>
                      <th className="px-3 py-2 text-end"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.map(({ server, monitorCount, load }) => (
                      <tr key={server.id} className="border-b border-border-subtle/40 hover:bg-surface/40">
                        <td className="px-3 py-1.5 text-text-primary font-medium">{server.name}</td>
                        <td className="px-3 py-1.5 font-mono text-text-secondary">
                          {server.hostname}{server.port != null ? `:${server.port}` : ''}
                        </td>
                        <td className="px-3 py-1.5">
                          <ServerStatusBadge status={server.status} />
                        </td>
                        <td className="px-3 py-1.5 text-end font-mono tabular-nums text-text-secondary">
                          {monitorCount}
                        </td>
                        <LoadCells load={load} layout="cells" />
                        <td className="px-3 py-1.5 text-end whitespace-nowrap">
                          <button
                            onClick={() => s.startEdit(server)}
                            aria-label={t('Edit {{name}}', { name: server.name })}
                            className="p-1 rounded text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => s.confirmDelete(server)}
                            aria-label={t('Delete {{name}}', { name: server.name })}
                            className="p-1 rounded text-text-muted hover:text-crimson hover:bg-crimson/10 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>
        </div>
      </main>
    </AppShell>
  );
}

/** Load / CPU% / Mem% — three table cells, or one inline strip. */
function LoadCells({ load, layout }: { load: ServerLoadSummary | null; layout: 'cells' | 'inline' }) {
  const { t, i18n } = useTranslation();
  const fmt = (v: number | null, suffix = '') =>
    v == null ? '—' : `${v.toLocaleString(i18n.language, { maximumFractionDigits: 1 })}${suffix}`;
  const sampled = load ? new Date(load.sampledAt).toLocaleString(i18n.language) : undefined;
  const title = sampled ? t('Sampled {{time}}', { time: sampled }) : t('No stats sample yet');
  if (layout === 'inline') {
    return (
      <dl className="grid grid-cols-3 gap-3 text-xs" title={title}>
        <div><dt className="text-[10px] uppercase tracking-wider text-text-muted">{t('Load')}</dt><dd className="font-mono text-text-primary">{fmt(load?.cpuLoad ?? null)}</dd></div>
        <div><dt className="text-[10px] uppercase tracking-wider text-text-muted">{t('CPU')}</dt><dd className="font-mono text-text-primary">{fmt(load?.cpuPercent ?? null, '%')}</dd></div>
        <div><dt className="text-[10px] uppercase tracking-wider text-text-muted">{t('Memory')}</dt><dd className="font-mono text-text-primary">{fmt(load?.memPercent ?? null, '%')}</dd></div>
      </dl>
    );
  }
  const cell = 'px-3 py-1.5 text-end font-mono tabular-nums text-text-secondary';
  return (
    <>
      <td className={cell} title={title}>{fmt(load?.cpuLoad ?? null)}</td>
      <td className={cell} title={title}>{fmt(load?.cpuPercent ?? null, '%')}</td>
      <td className={cell} title={title}>{fmt(load?.memPercent ?? null, '%')}</td>
    </>
  );
}

function ServerStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const tone = serverStatusTone(status);
  const cls = tone === 'ok'
    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
    : tone === 'down'
      ? 'bg-crimson/15 border-crimson/40 text-crimson'
      : 'bg-text-muted/15 border-border-subtle text-text-muted';
  const label = tone === 'ok' ? t('Running') : tone === 'down' ? t('Not running') : t('Unknown');
  return (
    <span className={clsx(
      'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase border',
      cls,
    )}>
      {label}
    </span>
  );
}

function ServerForm({ editing, onSaved }: { editing: Server | null; onSaved: () => void }) {
  const { t } = useTranslation();
  const f = useServerForm(editing, onSaved);
  const input = 'flex-1 px-2 py-1 text-xs bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50';

  return (
    <form onSubmit={f.submit} className="space-y-3">
      <Field label={t('Name')}>
        <input
          value={f.name}
          onChange={(e) => f.setName(e.target.value)}
          placeholder={t('e.g. zm-edge-01')}
          aria-label={t('Name')}
          className={input}
        />
      </Field>
      <Field label={t('Host')}>
        <input
          value={f.hostname}
          onChange={(e) => f.setHostname(e.target.value)}
          placeholder={t('hostname or IP')}
          aria-label={t('Host')}
          className={clsx(input, 'font-mono')}
        />
        <input
          value={f.port}
          onChange={(e) => f.setPort(e.target.value)}
          placeholder={t('port')}
          aria-label={t('Port')}
          className="w-20 px-2 py-1 text-xs font-mono bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
        />
      </Field>
      <Field label={t('Status')}>
        <select
          value={f.status}
          onChange={(e) => f.setStatus(e.target.value)}
          aria-label={t('Status')}
          className={input}
        >
          {SERVER_STATUSES.map((st) => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>
      </Field>
      {f.error && (
        <p role="alert" className="text-xs text-crimson">{t('Save failed: {{message}}', { message: f.error })}</p>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={f.submitDisabled}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border-2 border-cyan/60 bg-cyan/15 text-cyan hover:bg-cyan/25 transition-colors disabled:opacity-50"
        >
          {editing ? <Save size={12} /> : <Plus size={12} />}
          {editing ? t('Save') : t('Register')}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted w-16">
        {label}
      </span>
      {children}
    </div>
  );
}
