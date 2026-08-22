import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Pencil, Save, X, ChevronDown, ChevronRight } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QueryState } from '@/components/common/QueryState';
import { fieldClasses } from '@/components/common/styles';
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

const heading = 'text-sm font-medium text-fg';
const th = 'px-3 py-2 text-start text-xs font-medium text-fg-dim whitespace-nowrap';
const thEnd = 'px-3 py-2 text-end text-xs font-medium text-fg-dim whitespace-nowrap';
const iconBtn = 'p-1 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors';

/**
 * Settings → Servers — the modern skin.
 *
 * The load columns are the only coloured thing here, and only past the
 * legacy thresholds: a healthy cluster reads grey (docs/DESIGN.md).
 */
export default function SettingsServersPage() {
  const { t } = useTranslation();
  const s = useServersPage();
  useSiteTitle(t('Servers'));

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={t('Servers')}>
      <main className="flex-1 p-6 overflow-auto">
        <div className="mx-auto w-full max-w-[1500px] space-y-10">
          <section className="space-y-3">
            <h2 className={heading}>{t('Registered servers')}</h2>

            {s.statsError && (
              <p role="alert" className="text-xs text-warn">
                {t('Load columns unavailable: {{message}}', { message: s.statsError })}
              </p>
            )}

            <div className="rounded border border-border-subtle overflow-hidden">
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
                    <thead className="border-b border-border-subtle">
                      <tr>
                        <th className={thEnd}>{t('Id')}</th>
                        <th className={th}>{t('Name')}</th>
                        <th className={th}>{t('Url')}</th>
                        <th className={th}>{t('Path to index')}</th>
                        <th className={th}>{t('Path to ZMS')}</th>
                        <th className={th}>{t('Path to API')}</th>
                        <th className={th}>{t('Status')}</th>
                        <th className={thEnd}>{t('Monitors')}</th>
                        <th className={thEnd}>{t('Load')}</th>
                        <th className={thEnd}>{t('CPU')}</th>
                        <th className={thEnd}>{t('Free mem')}</th>
                        <th className={thEnd}>{t('Free swap')}</th>
                        <th className={thEnd}></th>
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
              <p className="px-3 py-2 text-xs text-fg-dim border-t border-border-subtle">
                {t('Only name, hostname, port and status are writable; the API does not accept the rest yet.')}
              </p>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start max-w-4xl">
            <RequirePerm feature="system" level="Edit">
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className={heading}>
                    {s.editing ? t('Edit server — {{name}}', { name: s.editing.name }) : t('New server')}
                  </h2>
                  {s.editing && (
                    <button
                      onClick={s.cancelEdit}
                      aria-label={t('Cancel edit')}
                      className={iconBtn}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <ServerForm key={s.editing?.id ?? 'new'} editing={s.editing} onSaved={s.onSaved} />
              </section>
            </RequirePerm>

            {s.localLoad && (
              <section className="space-y-3">
                <h2 className={heading}>{t('This host')}</h2>
                <p className="text-xs text-fg-dim">
                  {t('Latest zmstats sample recorded without a server id — the single-node default.')}
                </p>
                <LoadCells load={s.localLoad} layout="inline" />
              </section>
            )}
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
  const cell = 'px-3 py-1.5 font-mono text-fg-muted';

  return (
    <>
      <tr className="border-b border-border-subtle last:border-b-0 hover:bg-surface-2">
        <td className={clsx(cell, 'text-end tabular-nums')}>{server.id}</td>
        <td className="px-3 py-1.5 text-fg font-medium">{server.name}</td>
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
            className={iconBtn}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} className="rtl:-scale-x-100" />}
          </button>
          <RequirePerm feature="system" level="Edit">
            <button
              onClick={onEdit}
              aria-label={t('Edit {{name}}', { name: server.name })}
              className={iconBtn}
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={onDelete}
              aria-label={t('Delete {{name}}', { name: server.name })}
              className="p-1 rounded text-fg-dim hover:text-danger hover:bg-danger/10 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </RequirePerm>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border-subtle bg-surface-2">
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
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-xs">
      {daemons.map(({ daemon, enabled }) => (
        <DetailItem key={daemon} label={daemonLabels[daemon]}>
          <span className={enabled ? 'text-fg' : 'text-fg-dim'}>
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
      <dt className="text-xs text-fg-dim">{label}</dt>
      <dd className="font-mono text-fg-muted">{children}</dd>
    </div>
  );
}

/** A reading is only coloured once it is worth acting on. */
const TONE_CLS: Record<LoadTone, string> = {
  ok: 'text-fg-muted',
  warn: 'text-warn',
  error: 'text-danger font-semibold',
  none: 'text-fg-dim',
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
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs" title={title}>
        {cells.map(([label, value, tone]) => (
          <div key={label}>
            <dt className="text-xs text-fg-dim">{label}</dt>
            <dd className={clsx('font-mono tabular-nums', TONE_CLS[tone])} data-tone={tone}>{value}</dd>
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
    ? 'bg-ok/12 text-ok'
    : tone === 'down'
      ? 'bg-danger/12 text-danger'
      : 'bg-surface-2 text-fg-dim';
  const label = tone === 'ok' ? t('Running') : tone === 'down' ? t('Not running') : t('Unknown');
  return (
    <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-xs whitespace-nowrap', cls)}>
      {label}
    </span>
  );
}

function ServerForm({ editing, onSaved }: { editing: Server | null; onSaved: () => void }) {
  const { t } = useTranslation();
  const f = useServerForm(editing, onSaved);
  const input = clsx(fieldClasses('sm'), 'flex-1');

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
          className={clsx(fieldClasses('sm'), 'w-20 font-mono')}
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
        <p role="alert" className="text-xs text-danger">{t('Save failed: {{message}}', { message: f.error })}</p>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="sm" disabled={f.submitDisabled}>
          {editing ? <Save size={12} aria-hidden /> : <Plus size={12} aria-hidden />}
          {editing ? t('Save') : t('Register')}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-xs text-fg-dim">{label}</span>
      {children}
    </div>
  );
}
