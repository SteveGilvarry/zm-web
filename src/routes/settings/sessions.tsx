import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { clsx } from 'clsx';
import { Key, Plus, Trash2 } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { useAuthStore } from '@/stores/auth';
import { listSessions, createSession, deleteSession, type Session } from '@/api/sessions';

export const Route = createFileRoute('/settings/sessions')({
  component: SessionsPage,
});

/**
 * API tokens / sessions management. ZM uses session rows as long-lived
 * tokens for non-browser clients (CLI, integrations). Each row exposes an
 * id (the token value), an optional access bitmask, and a free-form data
 * blob for tagging purposes.
 */
function SessionsPage() {
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();

  const sessionsQ = useQuery({
    queryKey: ['sessions'],
    queryFn: () => listSessions({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const sessions: Session[] = sessionsQ.data?.items ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });

  if (!isAuthenticated) return null;

  return (
    <AppShell title="API Tokens">
      <main className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-5">
            <Panel title="New token" icon={<Plus size={16} />}>
              <CreateTokenForm onCreated={() => qc.invalidateQueries({ queryKey: ['sessions'] })} />
            </Panel>
          </div>

          <div className="col-span-7">
            <Panel title="Active tokens" icon={<Key size={16} />} noPadding>
              {sessions.length === 0 ? (
                <div className="py-10 text-center text-text-muted text-sm">
                  No active tokens. Create one on the left.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-surface/70 border-b border-border-subtle text-[10px] uppercase tracking-wider text-text-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">ID</th>
                      <th className="px-3 py-2 text-left">Access</th>
                      <th className="px-3 py-2 text-left">Data</th>
                      <th className="px-3 py-2 text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.id} className="border-b border-border-subtle/40 hover:bg-surface/40">
                        <td className="px-3 py-1.5 font-mono text-text-primary truncate max-w-[16rem]" title={s.id}>
                          {s.id}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-text-secondary">
                          {s.access != null ? `0x${s.access.toString(16)}` : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-text-muted truncate max-w-[14rem]" title={s.data ?? ''}>
                          {s.data || <span className="italic">—</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <button
                            onClick={() => {
                              if (confirm(`Revoke token ${s.id}?`)) deleteMutation.mutate(s.id);
                            }}
                            aria-label="Revoke token"
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

function CreateTokenForm({ onCreated }: { onCreated: () => void }) {
  const [tokenId, setTokenId] = useState(() => randomTokenId());
  const [accessHex, setAccessHex] = useState('ff');
  const [data, setData] = useState('');

  const create = useMutation({
    mutationFn: () =>
      createSession({
        id: tokenId,
        access: parseInt(accessHex || '0', 16),
        data: data || undefined,
      }),
    onSuccess: () => {
      onCreated();
      setTokenId(randomTokenId());
      setData('');
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Token">
        <input
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value)}
          className="flex-1 px-2 py-1 text-xs font-mono bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
        />
        <button
          type="button"
          onClick={() => setTokenId(randomTokenId())}
          className="px-2 py-1 text-[10px] font-medium rounded border border-border-subtle text-text-muted hover:border-cyan/40 hover:text-cyan transition-colors"
        >
          Regenerate
        </button>
      </Field>
      <Field label="Access">
        <span className="text-[10px] font-mono text-text-muted">0x</span>
        <input
          value={accessHex}
          onChange={(e) => setAccessHex(e.target.value.replace(/[^0-9a-fA-F]/g, ''))}
          placeholder="ff = admin"
          className="flex-1 px-2 py-1 text-xs font-mono bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
        />
      </Field>
      <Field label="Label">
        <input
          value={data}
          onChange={(e) => setData(e.target.value)}
          placeholder="(optional) what's this token for?"
          className="flex-1 px-2 py-1 text-xs bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
        />
      </Field>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={create.isPending || !tokenId.trim()}
          className={clsx(
            'flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border-2',
            'border-cyan/60 bg-cyan/15 text-cyan',
            'hover:bg-cyan/25 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <Plus size={12} />
          Create token
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

function randomTokenId(): string {
  // 16 hex chars — plenty of entropy, fits the ZM session id format.
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
