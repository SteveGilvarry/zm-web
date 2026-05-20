import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { clsx } from 'clsx';
import { Server as ServerIcon, Plus, Trash2 } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { useAuthStore } from '@/stores/auth';
import { listServers, createServer, deleteServer, type Server } from '@/api/servers';

export const Route = createFileRoute('/settings/servers')({
  component: ServersPage,
});

/**
 * Cluster / multi-server admin. In ZoneMinder you can run capture + analysis
 * across a fleet of "servers" so monitor work distributes geographically.
 * Each row here is a registered backend host the controller can dispatch to.
 */
function ServersPage() {
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();

  const serversQ = useQuery({
    queryKey: ['servers'],
    queryFn: () => listServers({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const servers: Server[] = serversQ.data?.items ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteServer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }),
  });

  if (!isAuthenticated) return null;

  return (
    <AppShell title="Servers">
      <main className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-5">
            <Panel title="New server" icon={<Plus size={16} />}>
              <CreateServerForm onCreated={() => qc.invalidateQueries({ queryKey: ['servers'] })} />
            </Panel>
          </div>

          <div className="col-span-7">
            <Panel title="Registered servers" icon={<ServerIcon size={16} />} noPadding>
              {servers.length === 0 ? (
                <div className="py-10 text-center text-text-muted text-sm">
                  No servers registered. The default install is single-node.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-surface/70 border-b border-border-subtle text-[10px] uppercase tracking-wider text-text-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Host</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-right"></th>
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
                        <td className="px-3 py-1.5 text-right">
                          <button
                            onClick={() => {
                              if (confirm(`Delete server "${s.name}"?`)) deleteMutation.mutate(s.id);
                            }}
                            aria-label={`Delete ${s.name}`}
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
      {status || 'Unknown'}
    </span>
  );
}

function CreateServerForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [hostname, setHostname] = useState('');
  const [port, setPort] = useState('');

  const create = useMutation({
    mutationFn: () =>
      createServer({
        name: name.trim(),
        hostname: hostname.trim() || null,
        port: port ? parseInt(port, 10) : null,
        status: 'unknown',
      }),
    onSuccess: () => {
      onCreated();
      setName('');
      setHostname('');
      setPort('');
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. zm-edge-01"
          className="flex-1 px-2 py-1 text-xs bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
        />
      </Field>
      <Field label="Host">
        <input
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
          placeholder="hostname or IP"
          className="flex-1 px-2 py-1 text-xs font-mono bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
        />
        <input
          value={port}
          onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="port"
          className="w-20 px-2 py-1 text-xs font-mono bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
        />
      </Field>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!name.trim() || create.isPending}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border-2 border-cyan/60 bg-cyan/15 text-cyan hover:bg-cyan/25 transition-colors disabled:opacity-50"
        >
          <Plus size={12} />
          Register
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted w-16">
        {label}
      </label>
      {children}
    </div>
  );
}
