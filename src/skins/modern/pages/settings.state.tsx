import { Fragment, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { Trans, useTranslation } from 'react-i18next';
import {
  Activity,
  Layers,
  Play,
  Power,
  RefreshCw,
  Save,
  Trash2,
  CheckCircle2,
  Loader2,
  Pencil,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import { parseDefinition, type DaemonAction, type State } from '@/api/states';
import { isProtectedState, useRunStatePage } from '@/features/state/useRunStatePage';
import { useSiteTitle } from '@/features/settings/useSiteTitle';

/** Settings → Run State — Mission Control. */
export default function SettingsStatePage() {
  const { t } = useTranslation();
  const rs = useRunStatePage();
  const { can } = usePerms();
  useSiteTitle(t('Run State'));
  const { states, monitors, busy, applyTarget, deleteTarget, daemonTarget } = rs;
  const canEdit = can('system', 'Edit');

  if (!rs.isAuthenticated) return null;

  return (
    <AppShell title={t('Run State')}>
      <main className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-12 gap-6">
          {/* Daemon supervisor controls */}
          <div className="col-span-12">
            <Panel title={t('Daemon supervisor')} icon={<Power size={16} />}>
              <p className="text-xs text-text-muted mb-3">
                <Trans>
                  Toggles the ZoneMinder process tree via <code className="font-mono">zmpkg.pl</code>. Stop will
                  halt recording across every monitor; Restart re-launches the supervisor without changing per-monitor
                  configuration.
                </Trans>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <RequirePerm feature="system" level="Edit" fallback="message">
                <DaemonButton
                  action="start"
                  icon={<Play size={12} />}
                  label={t('Start')}
                  onClick={() => rs.setDaemonTarget('start')}
                  disabled={busy}
                  tone="emerald"
                />
                <DaemonButton
                  action="stop"
                  icon={<Power size={12} />}
                  label={t('Stop')}
                  onClick={() => rs.setDaemonTarget('stop')}
                  disabled={busy}
                  tone="crimson"
                />
                <DaemonButton
                  action="restart"
                  icon={<RefreshCw size={12} />}
                  label={t('Restart')}
                  onClick={() => rs.setDaemonTarget('restart')}
                  disabled={busy}
                  tone="amber"
                />
                </RequirePerm>
                {rs.daemonPending && (
                  <span className="flex items-center gap-1 text-xs text-text-muted">
                    <Loader2 size={11} className="animate-spin" />
                    {t('Sending…')}
                  </span>
                )}
                {rs.daemonSuccess && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 size={12} />
                    {rs.daemonMessage ?? t('OK')}
                  </span>
                )}
                {rs.daemonError && (
                  <span className="text-xs text-crimson" role="alert">
                    {rs.daemonError.message ?? t('Failed')}
                  </span>
                )}
              </div>
            </Panel>
          </div>

          {/* Saved states list */}
          <div className="col-span-12 lg:col-span-8">
            <Panel
              title={t('Saved states')}
              icon={<Layers size={16} />}
              noPadding
            >
              <QueryState
                isLoading={rs.statesLoading}
                isError={rs.statesIsError}
                error={rs.statesRawError}
                onRetry={rs.refetchStates}
                empty={states.length === 0}
                emptyMessage={t('No saved states yet. Snapshot the current monitor configuration on the right.')}
              >
                <table className="w-full text-xs">
                  <thead className="bg-surface/70 border-b border-border-subtle text-[10px] uppercase tracking-wider text-text-muted">
                    <tr>
                      <th className="px-3 py-2 text-start">{t('Name')}</th>
                      <th className="px-3 py-2 text-start">{t('Active')}</th>
                      <th className="px-3 py-2 text-start">{t('Definition')}</th>
                      <th className="px-3 py-2 text-end">{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {states.map((s) => {
                      const isProtected = isProtectedState(s.name);
                      const parsed = parseDefinition(s.definition);
                      const preview =
                        parsed.length === 0
                          ? '—'
                          : t('{{count}} monitor', { count: parsed.length });
                      const renaming = rs.renameTarget?.id === s.id;
                      const expanded = rs.previewId === s.id;
                      return (
                        <Fragment key={s.id}>
                        <tr
                          className="border-b border-border-subtle/40 hover:bg-surface/40"
                        >
                          <td className="px-3 py-2 font-medium text-text-primary">
                            {renaming ? (
                              <input
                                value={rs.renameValue}
                                onChange={(e) => rs.setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') rs.commitRename();
                                  if (e.key === 'Escape') rs.cancelRename();
                                }}
                                onBlur={rs.commitRename}
                                autoFocus
                                aria-label={t('New name for {{name}}', { name: s.name })}
                                className="w-40 px-2 py-1 text-xs bg-surface border border-cyan/50 rounded text-text-primary focus:outline-none"
                              />
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                {s.name}
                                {canEdit && !isProtected && (
                                  <button
                                    type="button"
                                    onClick={() => rs.startRename(s)}
                                    aria-label={t('Rename {{name}}', { name: s.name })}
                                    className="p-0.5 rounded text-text-muted hover:text-cyan"
                                  >
                                    <Pencil size={10} />
                                  </button>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {s.is_active === 1 ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-mono uppercase">
                                <Activity size={10} />
                                {t('Active')}
                              </span>
                            ) : (
                              <span className="text-text-muted text-[10px] font-mono uppercase">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-text-muted font-mono max-w-[18rem]">
                            {parsed.length === 0 ? preview : (
                              <button
                                type="button"
                                onClick={() => rs.togglePreview(s.id)}
                                aria-expanded={expanded}
                                aria-label={t('Show definition of {{name}}', { name: s.name })}
                                className="inline-flex items-center gap-1 hover:text-text-primary"
                              >
                                {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} className="rtl:-scale-x-100" />}
                                {preview}
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-2 text-end">
                            <RequirePerm feature="system" level="Edit">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => rs.setApplyTarget(s)}
                                disabled={busy || s.is_active === 1}
                                aria-label={t('Apply state {{name}}', { name: s.name })}
                                className={clsx(
                                  'inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono uppercase tracking-wider border transition-colors',
                                  s.is_active === 1
                                    ? 'border-border-subtle text-text-muted cursor-not-allowed opacity-60'
                                    : 'border-cyan/40 text-cyan hover:bg-cyan/15',
                                )}
                              >
                                <Play size={10} />
                                {t('Apply')}
                              </button>
                              <button
                                onClick={() => rs.setDeleteTarget(s)}
                                disabled={busy || isProtected}
                                aria-label={t('Delete state {{name}}', { name: s.name })}
                                title={isProtected ? t('"default" cannot be deleted') : t('Delete state')}
                                className={clsx(
                                  'p-1 rounded transition-colors',
                                  isProtected
                                    ? 'text-text-dim cursor-not-allowed'
                                    : 'text-text-muted hover:text-crimson hover:bg-crimson/10',
                                )}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                            </RequirePerm>
                          </td>
                        </tr>
                        {expanded && <DefinitionPreviewRow state={s} rs={rs} />}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </QueryState>
            </Panel>
          </div>

          {/* Save current */}
          <div className="col-span-12 lg:col-span-4">
            <Panel title={t('Save current as…')} icon={<Save size={16} />}>
              <RequirePerm feature="system" level="Edit" fallback="message">
              <p className="text-xs text-text-muted mb-3">
                <Trans>
                  Snapshots every monitor's <span className="font-mono">Capturing</span>/
                  <span className="font-mono">Analysing</span>/<span className="font-mono">Recording</span> mode
                  into a new named state.
                </Trans>
              </p>
              <form onSubmit={rs.handleSaveCurrent} className="space-y-2">
                <input
                  value={rs.newStateName}
                  onChange={(e) => rs.setNewStateName(e.target.value)}
                  placeholder={t('e.g. Away, Holiday')}
                  aria-label={t('New state name')}
                  className="w-full px-2 py-1.5 text-xs bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
                />
                <button
                  type="submit"
                  disabled={
                    !rs.newStateName.trim() ||
                    rs.savePending ||
                    rs.monitorsLoading ||
                    monitors.length === 0
                  }
                  className={clsx(
                    'w-full flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium rounded border-2',
                    'border-cyan/60 bg-cyan/15 text-cyan',
                    'hover:bg-cyan/25 transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  {rs.savePending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Save size={12} />
                  )}
                  {t('Save snapshot')}
                </button>
                {rs.saveError && (
                  <p className="text-[11px] text-crimson" role="alert">
                    {rs.saveError.message ?? t('Save failed')}
                  </p>
                )}
                <p className="text-[10px] text-text-muted">
                  {t('{{count}} monitor will be captured.', { count: monitors.length })}
                </p>
              </form>
              </RequirePerm>
            </Panel>
          </div>
        </div>
      </main>

      {/* Apply confirm */}
      <ConfirmDialog
        isOpen={!!applyTarget}
        onClose={() => rs.setApplyTarget(null)}
        onConfirm={rs.confirmApply}
        title={t('Apply run state')}
        message={
          applyTarget
            ? t('Apply state "{{name}}"? Every monitor\'s Capturing / Analysing / Recording mode will be overwritten and affected daemons restarted.', { name: applyTarget.name })
            : ''
        }
        confirmText={t('Apply')}
        variant="warning"
        isLoading={rs.applyPending}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => rs.setDeleteTarget(null)}
        onConfirm={rs.confirmDelete}
        title={t('Delete state')}
        message={
          deleteTarget
            ? t('Delete saved state "{{name}}"? This removes the preset only — it does not change any monitor\'s current mode.', { name: deleteTarget.name })
            : ''
        }
        confirmText={t('Delete')}
        variant="danger"
        isLoading={rs.deletePending}
      />

      {/* Daemon action confirm — start, stop and restart all prompt first */}
      <ConfirmDialog
        isOpen={daemonTarget !== null}
        onClose={() => rs.setDaemonTarget(null)}
        onConfirm={rs.confirmDaemon}
        title={
          daemonTarget === 'stop' ? t('Stop ZoneMinder')
            : daemonTarget === 'restart' ? t('Restart ZoneMinder')
              : t('Start ZoneMinder')
        }
        message={
          daemonTarget === 'stop'
            ? t('Stop ZoneMinder? Recording will halt across every monitor.')
            : daemonTarget === 'restart'
              ? t('Restart ZoneMinder? Capture streams will reconnect after a short outage.')
              : t('Start ZoneMinder? Capture and analysis daemons will launch for every enabled monitor.')
        }
        confirmText={
          daemonTarget === 'stop' ? t('Stop') : daemonTarget === 'restart' ? t('Restart') : t('Start')
        }
        variant={daemonTarget === 'stop' ? 'danger' : 'warning'}
        isLoading={rs.daemonPending}
      />

    </AppShell>
  );
}

interface DaemonButtonProps {
  action: DaemonAction;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
  tone: 'emerald' | 'crimson' | 'amber';
}

function DaemonButton({ icon, label, onClick, disabled, tone }: DaemonButtonProps) {
  const toneCls =
    tone === 'emerald'
      ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15'
      : tone === 'crimson'
        ? 'border-crimson/40 text-crimson hover:bg-crimson/15'
        : 'border-amber/40 text-amber hover:bg-amber/15';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center gap-1 px-3 py-1.5 rounded font-mono text-[11px] uppercase tracking-wider border-2 transition-colors',
        toneCls,
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** Expanded row: the `Id:Capturing:Analysing:Recording` triples with monitor names. */
function DefinitionPreviewRow({ state, rs }: { state: State; rs: ReturnType<typeof useRunStatePage> }) {
  const { t } = useTranslation();
  const rows = rs.definitionRows(state);
  return (
    <tr className="bg-panel/30 border-b border-border-subtle/40">
      <td colSpan={4} className="px-3 py-2">
        <table className="w-full text-[11px]" aria-label={t('Definition of {{name}}', { name: state.name })}>
          <thead className="text-[10px] uppercase tracking-wider text-text-muted">
            <tr>
              <th className="text-start px-2 py-1">{t('Monitor')}</th>
              <th className="text-start px-2 py-1">{t('Capturing')}</th>
              <th className="text-start px-2 py-1">{t('Analysing')}</th>
              <th className="text-start px-2 py-1">{t('Recording')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={clsx(!r.known && 'text-text-muted italic')}>
                <td className="px-2 py-1">
                  <span className="font-mono text-text-muted me-1">#{r.id}</span>
                  {r.name}
                  {!r.known && <span className="ms-1">({t('no longer exists')})</span>}
                </td>
                <td className="px-2 py-1 font-mono">{r.capturing}</td>
                <td className="px-2 py-1 font-mono">{r.analysing}</td>
                <td className="px-2 py-1 font-mono">{r.recording}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}
