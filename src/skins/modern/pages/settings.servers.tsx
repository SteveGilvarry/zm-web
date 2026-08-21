import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Server as ServerIcon, Plus, Trash2, Pencil, Save, X, Activity, ChevronDown, ChevronRight } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import type { Server } from '@/api/servers';
import { useServersPage, type ServerRow } from '@/features/servers/useServersPage';
import { SERVER_STATUSES, useServerForm } from '@/features/servers/useServerForm';
import type { ServerDaemon } from '@/features/servers/serverFields';
import { cpuLoadTone, freeTone, serverStatusTone, type LoadTone, type ServerLoadSummary } from '@/features/servers/serverStats';
import { useDateTimeFormat } from '@/features/config/useDateTimeFormat';
import { useSiteTitle } from '@/features/settings/useSiteTitle';

/** Table width: Id, Name, Url, three paths, Status, Monitors, four load cells, actions. */
const COLUMN_COUNT = 13;

/** Settings → Servers — Mission Control. */
export default function SettingsServersPage() {
  const { t } = useTranslation();
  const s = useServersPage();
  useSiteTitle(t('Servers'));

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={t('Servers')}>
      <main className="flex-1 p-6 overflow-auto space-y-6">
        <Panel title={t('Registered servers')} icon={<ServerIcon size={16} />} noPadding>
          {s.statsError && (
            <p role="alert" className="px-3 py-2 text-xs text-amber border-b border-border-subtle">
              {t('Load columns unavailable: {{message}}', { message: s.statsError })}
            </p>
          )}
          <QueryState
            isLoading={s.isLoading}
            isError={s.isError}
            error={s.error}
            onRetry={s.refetch}
            empty={s.rows.length === 0}
            emptyMessage={t('No servers registered. The default install is single-node.')}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface/70 border-b border-border-subtle text-[10px] uppercase tracking-wider text-text-muted">
                  <tr>
                    <th className="px-3 py-2 text-end">{t('Id')}</th>
                    <th className="px-3 py-2 text-start">{t('Name')}</th>
                    <th className="px-3 py-2 text-start">{t('Url')}</th>
                    <th className="px-3 py-2 text-start">{t('Path to index')}</th>
                    <th className="px-3 py-2 text-start">{t('Path to ZMS')}</th>
                    <th className="px-3 py-2 text-start">{t('Path to API')}</th>
                    <th className="px-3 py-2 text-start">{t('Status')}</th>
                    <th className="px-3 py-2 text-end">{t('Monitors')}</th>
                    <th className="px-3 py-2 text-end">{t('Load')}</th>
                    <th className="px-3 py-2 text-end">{t('CPU')}</th>
                    <th className="px-3 py-2 text-end">{t('Free mem')}</th>
                    <th className="px-3 py-2 text-end">{t('Free swap')}</th>
                    <th className="px-3 py-2 text-end"></th>
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((row) => (
                    <ServerRows
                      key={row.server.id}
                      row={row}
                      expanded={s.expandedId === row.server.id}
                      onToggle={() => s.toggleDetail(row.server.id)}
                      onEdit={() => s.startEdit(row.server)}
                      onDelete={() => s.requestDelete(row.server)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </QueryState>
          {/* Said once for the whole page — see `UpdateServerRequest` in the OpenAPI spec. */}
          <p className="px-3 py-2 text-[11px] text-text-muted border-t border-border-subtle">
            {t('Only name, hostname, port and status are writable; the API does not accept the rest yet.')}
          </p>
        </Panel>

        <div className="grid grid-cols-12 gap-6 items-start">
          <div className="col-span-5">
            <RequirePerm feature="system" level="Edit">
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
            </RequirePerm>
          </div>

          {s.localLoad && (
            <div className="col-span-7">
              <Panel title={t('This host')} icon={<Activity size={16} />}>
                <p className="text-[11px] text-text-muted mb-2">
                  {t('Latest zmstats sample recorded without a server id — the single-node default.')}
                </p>
                <LoadCells load={s.localLoad} layout="inline" />
              </Panel>
            </div>
          )}
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

/** One server: the legacy column set, plus the read-only detail it expands into. */
function ServerRows({ row, expanded, onToggle, onEdit, onDelete }: {
  row: ServerRow;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { server, monitorCount, load, url } = row;
  const cell = 'px-3 py-1.5 font-mono text-text-secondary';

  return (
    <>
      <tr className="border-b border-border-subtle/40 hover:bg-surface/40">
        <td className={clsx(cell, 'text-end tabular-nums')}>{server.id}</td>
        <td className="px-3 py-1.5 text-text-primary font-medium">{server.name}</td>
        <td className={cell}>{url ?? '—'}</td>
        <td className={cell}>{server.path_to_index || '—'}</td>
        <td className={cell}>{server.path_to_zms || '—'}</td>
        <td className={cell}>{server.path_to_api || '—'}</td>
        <td className="px-3 py-1.5"><ServerStatusBadge status={server.status} /></td>
        <td className={clsx(cell, 'text-end tabular-nums')}>{monitorCount}</td>
        <LoadCells load={load} layout="cells" />
        <td className="px-3 py-1.5 text-end whitespace-nowrap">
          <button
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={t('Details for {{name}}', { name: server.name })}
            className="p-1 rounded text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          <RequirePerm feature="system" level="Edit">
            <button
              onClick={onEdit}
              aria-label={t('Edit {{name}}', { name: server.name })}
              className="p-1 rounded text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={onDelete}
              aria-label={t('Delete {{name}}', { name: server.name })}
              className="p-1 rounded text-text-muted hover:text-crimson hover:bg-crimson/10 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </RequirePerm>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border-subtle/40 bg-surface/30">
          <td colSpan={COLUMN_COUNT} className="px-3 py-3">
            <ServerDetail row={row} />
          </td>
        </tr>
      )}
    </>
  );
}

/** Daemon flags, run state and coordinates — stored on the row, not editable. */
function ServerDetail({ row }: { row: ServerRow }) {
  const { t } = useTranslation();
  const { server, daemons, coords } = row;
  const daemonLabels: Record<ServerDaemon, string> = {
    zmstats: t('Run stats'),
    zmaudit: t('Run audit'),
    zmtrigger: t('Run trigger'),
    zmeventnotification: t('Run event notification'),
  };

  return (
    <dl className="grid grid-cols-4 gap-x-6 gap-y-3 text-xs">
      {daemons.map(({ daemon, enabled }) => (
        <DetailItem key={daemon} label={daemonLabels[daemon]}>
          <span className={enabled ? 'text-emerald-400' : 'text-text-muted'}>
            {enabled ? t('Yes') : t('No')}
          </span>
        </DetailItem>
      ))}
      <DetailItem label={t('Protocol')}>{server.protocol || '—'}</DetailItem>
      <DetailItem label={t('Hostname')}>{server.hostname || '—'}</DetailItem>
      <DetailItem label={t('Run state')}>{server.state_id ?? '—'}</DetailItem>
      <DetailItem label={t('Coordinates')}>{coords ?? '—'}</DetailItem>
    </dl>
  );
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-text-muted">{label}</dt>
      <dd className="font-mono text-text-secondary">{children}</dd>
    </div>
  );
}

const TONE_CLS: Record<LoadTone, string> = {
  ok: 'text-text-secondary',
  warn: 'text-amber',
  error: 'text-crimson font-semibold',
  none: 'text-text-muted',
};

/** Load / CPU% / free mem% / free swap% — table cells, or one inline strip. Legacy thresholds colour them. */
function LoadCells({ load, layout }: { load: ServerLoadSummary | null; layout: 'cells' | 'inline' }) {
  const { t, i18n } = useTranslation();
  const { formatDateTime } = useDateTimeFormat();
  const fmt = (v: number | null, suffix = '') =>
    v == null ? '—' : `${v.toLocaleString(i18n.language, { maximumFractionDigits: 1 })}${suffix}`;
  const title = load ? t('Sampled {{time}}', { time: formatDateTime(load.sampledAt) }) : t('No stats sample yet');
  const cpuLoad = load?.cpuLoad ?? null;
  const memFree = load?.memFreePercent ?? null;
  const swapFree = load?.swapFreePercent ?? null;
  const cells: Array<[string, string, LoadTone]> = [
    [t('Load'), fmt(cpuLoad), cpuLoadTone(cpuLoad)],
    [t('CPU'), fmt(load?.cpuPercent ?? null, '%'), 'ok'],
    [t('Free mem'), fmt(memFree, '%'), freeTone(memFree)],
    [t('Free swap'), fmt(swapFree, '%'), freeTone(swapFree)],
  ];
  if (layout === 'inline') {
    return (
      <dl className="grid grid-cols-4 gap-3 text-xs" title={title}>
        {cells.map(([label, value, tone]) => (
          <div key={label}>
            <dt className="text-[10px] uppercase tracking-wider text-text-muted">{label}</dt>
            <dd className={clsx('font-mono', TONE_CLS[tone])} data-tone={tone}>{value}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <>
      {cells.map(([label, value, tone]) => (
        <td key={label} className={clsx('px-3 py-1.5 text-end font-mono tabular-nums', TONE_CLS[tone])} title={title} data-tone={tone}>
          {value}
        </td>
      ))}
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
