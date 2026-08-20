import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Server as ServerIcon, Plus, Trash2 } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { useServersPage } from '@/features/servers/useServersPage';
import { useCreateServerForm } from '@/features/servers/useCreateServerForm';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/** Settings → Servers — Mission Control. */
export default function SettingsServersPage() {
  const { t } = useTranslation();
  const { isAuthenticated, servers, confirmDelete, invalidateServers } = useServersPage();
  useDocumentTitle(t('Servers'));

  if (!isAuthenticated) return null;

  return (
    <AppShell title={t('Servers')}>
      <main className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-5">
            <Panel title={t('New server')} icon={<Plus size={16} />}>
              <CreateServerForm onCreated={invalidateServers} />
            </Panel>
          </div>

          <div className="col-span-7">
            <Panel title={t('Registered servers')} icon={<ServerIcon size={16} />} noPadding>
              {servers.length === 0 ? (
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
                      <th className="px-3 py-2 text-end"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {servers.map((s) => (
                      <tr key={s.id} className="border-b border-border-subtle/40 hover:bg-surface/40">
                        <td className="px-3 py-1.5 text-text-primary font-medium">{s.name}</td>
                        <td className="px-3 py-1.5 font-mono text-text-secondary">
                          {s.hostname}{s.port != null ? `:${s.port}` : ''}
                        </td>
                        <td className="px-3 py-1.5">
                          <ServerStatusBadge status={s.status} />
                        </td>
                        <td className="px-3 py-1.5 text-end">
                          <button
                            onClick={() => confirmDelete(s)}
                            aria-label={t('Delete {{name}}', { name: s.name })}
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

function ServerStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const cls = status.toLowerCase() === 'running' || status.toLowerCase() === 'online'
    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
    : status.toLowerCase() === 'offline' || status.toLowerCase() === 'down'
      ? 'bg-crimson/15 border-crimson/40 text-crimson'
      : 'bg-text-muted/15 border-border-subtle text-text-muted';
  return (
    <span className={clsx(
      'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase border',
      cls,
    )}>
      {status || t('Unknown')}
    </span>
  );
}

function CreateServerForm({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation();
  const f = useCreateServerForm(onCreated);

  return (
    <form onSubmit={f.submit} className="space-y-3">
      <Field label={t('Name')}>
        <input
          value={f.name}
          onChange={(e) => f.setName(e.target.value)}
          placeholder={t('e.g. zm-edge-01')}
          className="flex-1 px-2 py-1 text-xs bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
        />
      </Field>
      <Field label={t('Host')}>
        <input
          value={f.hostname}
          onChange={(e) => f.setHostname(e.target.value)}
          placeholder={t('hostname or IP')}
          className="flex-1 px-2 py-1 text-xs font-mono bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
        />
        <input
          value={f.port}
          onChange={(e) => f.setPort(e.target.value)}
          placeholder={t('port')}
          className="w-20 px-2 py-1 text-xs font-mono bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
        />
      </Field>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={f.submitDisabled}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border-2 border-cyan/60 bg-cyan/15 text-cyan hover:bg-cyan/25 transition-colors disabled:opacity-50"
        >
          <Plus size={12} />
          {t('Register')}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted w-16">
        {label}
      </label>
      {children}
    </div>
  );
}
