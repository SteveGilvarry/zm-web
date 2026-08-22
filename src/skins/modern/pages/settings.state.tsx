import { Fragment, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { Trans, useTranslation } from 'react-i18next';
import {
  Activity,
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
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QueryState } from '@/components/common/QueryState';
import { fieldClasses } from '@/components/common/styles';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import { parseDefinition, type DaemonAction, type State } from '@/api/states';
import { isProtectedState, useRunStatePage } from '@/features/state/useRunStatePage';
import { useSiteTitle } from '@/features/settings/useSiteTitle';

const heading = 'text-sm font-medium text-fg';
const th = 'px-3 py-2 text-start text-xs font-medium text-fg-dim';

/**
 * Settings → Run State — the modern skin.
 *
 * Three sections separated by space rather than by three panel frames; the
 * only colour is which state is active and the two verbs that interrupt
 * recording (docs/DESIGN.md).
 */
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
        <div className="mx-auto w-full max-w-5xl space-y-10">
          {/* Daemon supervisor controls */}
          <section className="space-y-3">
            <h2 className={heading}>{t('Daemon supervisor')}</h2>
            <p className="max-w-prose text-xs text-fg-dim">
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
                  tone="neutral"
                />
                <DaemonButton
                  action="stop"
                  icon={<Power size={12} />}
                  label={t('Stop')}
                  onClick={() => rs.setDaemonTarget('stop')}
                  disabled={busy}
                  tone="danger"
                />
                <DaemonButton
                  action="restart"
                  icon={<RefreshCw size={12} />}
                  label={t('Restart')}
                  onClick={() => rs.setDaemonTarget('restart')}
                  disabled={busy}
                  tone="danger"
                />
              </RequirePerm>
              {rs.daemonPending && (
                <span className="flex items-center gap-1 text-xs text-fg-dim">
                  <Loader2 size={11} className="animate-spin" />
                  {t('Sending…')}
                </span>
              )}
              {rs.daemonSuccess && (
                <span className="flex items-center gap-1 text-xs text-ok">
                  <CheckCircle2 size={12} aria-hidden />
                  {rs.daemonMessage ?? t('OK')}
                </span>
              )}
              {rs.daemonError && (
                <span className="text-xs text-danger" role="alert">
                  {rs.daemonError.message ?? t('Failed')}
                </span>
              )}
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
            {/* Saved states list */}
            <section className="lg:col-span-2 space-y-3">
              <h2 className={heading}>{t('Saved states')}</h2>
              <div className="rounded border border-border-subtle overflow-hidden">
                <QueryState
                  isLoading={rs.statesLoading}
                  isError={rs.statesIsError}
                  error={rs.statesRawError}
                  onRetry={rs.refetchStates}
                  empty={states.length === 0}
                  emptyMessage={t('No saved states yet. Snapshot the current monitor configuration on the right.')}
                >
                  <table className="w-full text-xs">
                    <thead className="border-b border-border-subtle">
                      <tr>
                        <th className={th}>{t('Name')}</th>
                        <th className={th}>{t('Active')}</th>
                        <th className={th}>{t('Definition')}</th>
                        <th className={clsx(th, 'text-end')}>{t('Actions')}</th>
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
                            <tr className="border-b border-border-subtle last:border-b-0 hover:bg-surface-2">
                              <td className="px-3 py-2 font-medium text-fg">
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
                                    className={clsx(fieldClasses('sm'), 'w-40 border-accent')}
                                  />
                                ) : (
                                  <span className="inline-flex items-center gap-1">
                                    {s.name}
                                    {canEdit && !isProtected && (
                                      <button
                                        type="button"
                                        onClick={() => rs.startRename(s)}
                                        aria-label={t('Rename {{name}}', { name: s.name })}
                                        className="p-0.5 rounded text-fg-dim hover:text-fg"
                                      >
                                        <Pencil size={10} />
                                      </button>
                                    )}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {s.is_active === 1 ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-ok/12 text-ok text-xs">
                                    <Activity size={10} aria-hidden />
                                    {t('Active')}
                                  </span>
                                ) : (
                                  <span className="text-fg-dim">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-fg-muted max-w-[18rem]">
                                {parsed.length === 0 ? preview : (
                                  <button
                                    type="button"
                                    onClick={() => rs.togglePreview(s.id)}
                                    aria-expanded={expanded}
                                    aria-label={t('Show definition of {{name}}', { name: s.name })}
                                    className="inline-flex items-center gap-1 hover:text-fg"
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
                                        'inline-flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors',
                                        s.is_active === 1
                                          ? 'border-border-subtle text-fg-faint cursor-not-allowed'
                                          : 'border-border-subtle text-fg-muted hover:text-fg hover:border-border',
                                      )}
                                    >
                                      <Play size={10} aria-hidden />
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
                                          ? 'text-fg-faint cursor-not-allowed'
                                          : 'text-fg-dim hover:text-danger hover:bg-danger/10',
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
              </div>
            </section>

            {/* Save current */}
            <section className="space-y-3">
              <h2 className={heading}>{t('Save current as…')}</h2>
              <RequirePerm feature="system" level="Edit" fallback="message">
                <p className="text-xs text-fg-dim">
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
                    className={fieldClasses('sm')}
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    className="w-full"
                    disabled={
                      !rs.newStateName.trim() ||
                      rs.savePending ||
                      rs.monitorsLoading ||
                      monitors.length === 0
                    }
                  >
                    {rs.savePending ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Save size={12} aria-hidden />
                    )}
                    {t('Save snapshot')}
                  </Button>
                  {rs.saveError && (
                    <p className="text-xs text-danger" role="alert">
                      {rs.saveError.message ?? t('Save failed')}
                    </p>
                  )}
                  <p className="text-xs text-fg-dim">
                    {t('{{count}} monitor will be captured.', { count: monitors.length })}
                  </p>
                </form>
              </RequirePerm>
            </section>
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
  /** `danger` for the two verbs that interrupt recording; everything else is quiet. */
  tone: 'neutral' | 'danger';
}

function DaemonButton({ icon, label, onClick, disabled, tone }: DaemonButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-sm transition-colors',
        tone === 'danger'
          ? 'border-danger/40 text-danger hover:bg-danger/10'
          : 'border-border-subtle text-fg-muted hover:text-fg hover:border-border',
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
    <tr className="bg-surface-2 border-b border-border-subtle">
      <td colSpan={4} className="px-3 py-2">
        <table className="w-full text-xs" aria-label={t('Definition of {{name}}', { name: state.name })}>
          <thead className="text-fg-dim">
            <tr>
              <th className="text-start px-2 py-1 font-medium">{t('Monitor')}</th>
              <th className="text-start px-2 py-1 font-medium">{t('Capturing')}</th>
              <th className="text-start px-2 py-1 font-medium">{t('Analysing')}</th>
              <th className="text-start px-2 py-1 font-medium">{t('Recording')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={clsx(!r.known && 'text-fg-dim italic')}>
                <td className="px-2 py-1">
                  <span className="font-mono tabular-nums text-fg-dim me-1">#{r.id}</span>
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
