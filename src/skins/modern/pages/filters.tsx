import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import {
  Plus, Trash2, Save, Archive, ArchiveRestore, Trash, Clock, Video, Terminal,
  Mail, MessageSquare, Copy, Move, Activity, Lock, Layers, HardDrive, Upload, AlertTriangle,
  CopyPlus, RotateCcw, Bug,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { FILTER_SORT_FIELDS, type FilterColumns } from '@/api/filters';
import { RuleBuilder } from '@/features/filters/RuleBuilder';
import { MatchesPreview } from '@/features/filters/MatchesPreview';
import { useFilterSortFieldLabels } from '@/features/filters/labels';
import { useFiltersPage, type FlagKey } from '@/features/filters/useFiltersPage';
import type { ZmStorage } from '@/types';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/**
 * Filters — the modern skin. One action line, then the saved list and the
 * rule/action editor as two panes that scroll inside themselves.
 */
export default function FiltersPage() {
  const { t } = useTranslation();
  const s = useFiltersPage();
  const [showDebug, setShowDebug] = useState(false);
  useDocumentTitle(t('Filters'));
  const sortLabels = useFilterSortFieldLabels();
  const {
    filters, monitors, storage, selectedId, selectedFilter, startEditing,
    draftName, setDraftName, draftQuery, setDraftQuery, unreadable,
    draftColumns: c, setColumn, toggleFlag, composeQueryJson, canSave,
  } = s;

  if (!s.isAuthenticated) return null;

  const label = 'text-xs text-fg-dim';
  const input = 'px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent transition-colors';
  const flag = (key: FlagKey) => c[key] === 1;

  const onSave = () => {
    if (s.deleteEverythingRisk && !confirm(t('This filter has no conditions and deletes its matches. Once the daemon runs it, every event will be deleted. Save anyway?'))) {
      return;
    }
    if (selectedId) s.save();
    else s.create();
  };
  const onSaveAs = () => {
    const name = prompt(t('Save filter as'), draftName ? t('{{name}} copy', { name: draftName }) : '');
    if (name) s.saveAs(name);
  };
  const smallBtn = 'shrink-0 flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors disabled:opacity-50';

  return (
    <AppShell title={t('Filters')}>
      <main className="flex-1 min-h-0 flex flex-col">
        {/* One action line: what is open, and what you can do to it. */}
        <div className="flex items-center gap-2 px-3 h-11 shrink-0 border-b border-border-subtle bg-surface">
          <span className="text-sm text-fg truncate">
            {selectedFilter ? t('Editing — {{name}}', { name: selectedFilter.name }) : t('New filter')}
          </span>
          <span className="ms-auto" />
          <button
            type="button"
            onClick={() => setShowDebug((v) => !v)}
            aria-pressed={showDebug}
            className={clsx(smallBtn, showDebug ? 'bg-accent/15 text-accent' : 'text-fg-dim hover:text-fg')}
          >
            <Bug size={12} aria-hidden />
            {t('Debug')}
          </button>
          <button
            type="button"
            onClick={s.reset}
            className={clsx(smallBtn, 'text-fg-dim hover:text-fg')}
          >
            <RotateCcw size={12} aria-hidden />
            {t('Reset')}
          </button>
          <RequirePerm feature="events" level="Edit">
            <button
              type="button"
              onClick={onSaveAs}
              disabled={!draftQuery || s.createPending}
              className={clsx(smallBtn, 'text-fg-dim hover:text-fg')}
            >
              <CopyPlus size={12} aria-hidden />
              {t('Save As')}
            </button>
            <button
              onClick={onSave}
              disabled={!canSave || s.savePending || s.createPending}
              className={clsx(smallBtn, 'bg-accent text-accent-fg font-medium hover:bg-accent-dim')}
            >
              {selectedId ? <Save size={12} aria-hidden /> : <Plus size={12} aria-hidden />}
              {selectedId ? t('Save') : t('Create')}
            </button>
          </RequirePerm>
        </div>

        <div className="flex-1 min-h-0 flex">
          {/* Saved filter list */}
          <div className="w-60 shrink-0 min-h-0 overflow-auto border-e border-border-subtle p-2">
              <button
                onClick={() => startEditing(null)}
                className="flex items-center gap-1 w-full px-2 py-1.5 mb-2 rounded border border-dashed border-border-subtle text-xs text-fg-dim hover:text-fg hover:border-border transition-colors"
              >
                <Plus size={12} aria-hidden />
                {t('New filter')}
              </button>

              <QueryState
                isLoading={s.isLoading}
                isError={s.isError}
                error={s.error}
                onRetry={s.refetch}
                empty={filters.length === 0}
                emptyMessage={t('No saved filters yet.')}
              >
              <ul className="space-y-0.5">
                {filters.map((f) => (
                    <li key={f.id}>
                      <div
                        className={clsx(
                          'flex items-center gap-1 px-2 py-1.5 rounded transition-colors',
                          selectedId === f.id
                            ? 'bg-accent/10 border border-accent/30'
                            : 'border border-transparent hover:bg-surface/60',
                        )}
                      >
                        <button
                          onClick={() => startEditing(f)}
                          className={clsx(
                            'flex-1 text-start text-xs truncate',
                            selectedId === f.id ? 'text-accent' : 'text-fg',
                          )}
                        >
                          {f.name}
                          {/* Legacy cues: * = background, & = concurrent */}
                          {f.background === 1 && <span className="text-fg-dim" title={t('Runs in background')}>*</span>}
                          {f.concurrent === 1 && <span className="text-fg-dim" title={t('Runs concurrently')}>&amp;</span>}
                        </button>
                        <RequirePerm feature="events" level="Edit">
                          <button
                            onClick={() => {
                              if (confirm(t('Delete filter "{{name}}"?', { name: f.name }))) s.remove(f.id);
                            }}
                            className="p-1 rounded text-fg-dim hover:text-danger hover:bg-danger/10 transition-colors"
                            aria-label={t('Delete {{name}}', { name: f.name })}
                          >
                            <Trash2 size={11} />
                          </button>
                        </RequirePerm>
                      </div>
                    </li>
                  ))}
              </ul>
              </QueryState>
          </div>

          {/* Editor */}
          <div className="flex-1 min-w-0 min-h-0 overflow-auto p-3">
              <div className="space-y-4">
                {s.saveError && (
                  <p role="alert" className="text-xs text-danger">
                    {t('Save failed: {{message}}', { message: s.saveError.message })}
                  </p>
                )}

                {/* Name */}
                <div className="flex items-center gap-3">
                  <label htmlFor="filter-name" className={clsx(label, 'w-20')}>{t('Name')}</label>
                  <input
                    id="filter-name"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder={t('Untitled filter')}
                    className={clsx(input, 'flex-1 text-sm')}
                  />
                </div>

                {/* Conditions */}
                <div>
                  <h3 className="mb-2 text-xs font-medium text-fg-muted">{t('Conditions')}</h3>
                  {unreadable ? (
                    <div className="space-y-2 border border-warn/40 rounded-md p-3 bg-warn/5" data-testid="unreadable-query">
                      <p className="flex items-start gap-2 text-xs text-warn">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <span>
                          {t('This filter’s conditions are stored in a format the dashboard cannot read ({{reason}}). They are shown as-is and will not be changed; saving is disabled so nothing is overwritten. Edit it in the legacy ZoneMinder UI.', {
                            reason: unreadable.reason,
                          })}
                        </span>
                      </p>
                      <pre className="p-2 rounded bg-bg-sunken border border-border-subtle text-fg-muted overflow-x-auto font-mono text-xs whitespace-pre-wrap break-all">
                        {unreadable.raw}
                      </pre>
                    </div>
                  ) : draftQuery ? (
                    <>
                      <RuleBuilder
                        query={draftQuery}
                        monitors={monitors}
                        storage={storage}
                        onChange={setDraftQuery}
                      />

                      {/* Sort / limit / skip locked — ZM's `sort_field`, `sort_asc`, `limit`, `skip_locked` */}
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-fg-muted">
                        <span className="flex items-center gap-2">
                          <label htmlFor="filter-sort" className={label}>{t('Sort by')}</label>
                          <select
                            id="filter-sort"
                            value={draftQuery.sort_field ?? ''}
                            onChange={(e) => setDraftQuery({ ...draftQuery, sort_field: e.target.value })}
                            className={input}
                          >
                            {FILTER_SORT_FIELDS.map((f) => (
                              <option key={f} value={f}>{sortLabels[f]}</option>
                            ))}
                          </select>
                          <select
                            aria-label={t('Sort direction')}
                            value={draftQuery.sort_asc === '1' ? '1' : '0'}
                            onChange={(e) => setDraftQuery({ ...draftQuery, sort_asc: e.target.value })}
                            className={input}
                          >
                            <option value="1">{t('Ascending')}</option>
                            <option value="0">{t('Descending')}</option>
                          </select>
                        </span>
                        <span className="flex items-center gap-2">
                          <label htmlFor="filter-limit" className={label}>{t('Limit to first')}</label>
                          <input
                            id="filter-limit"
                            type="number"
                            min={0}
                            value={draftQuery.limit ?? '0'}
                            onChange={(e) => setDraftQuery({ ...draftQuery, limit: e.target.value.replace(/[^\d]/g, '') || '0' })}
                            className={clsx(input, 'w-20 font-mono')}
                          />
                          <span className="text-fg-dim">{t('results (0 = all)')}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <label htmlFor="filter-skip-locked" className={label}>{t('Skip locked')}</label>
                          <select
                            id="filter-skip-locked"
                            value={draftQuery.skip_locked === '1' ? '1' : '0'}
                            onChange={(e) => setDraftQuery({ ...draftQuery, skip_locked: e.target.value })}
                            className={input}
                          >
                            <option value="0">{t('No')}</option>
                            <option value="1">{t('Yes')}</option>
                          </select>
                        </span>
                      </div>
                    </>
                  ) : null}
                </div>

                {/* Actions — one column each on the backend */}
                <div>
                  <h3 className="mb-2 text-xs font-medium text-fg-muted">{t('Actions')}</h3>
                  <div className="flex flex-wrap gap-2">
                    <ActionToggle icon={<Archive size={11} />} label={t('Archive all matches')} active={flag('auto_archive')} onClick={() => toggleFlag('auto_archive')} />
                    <ActionToggle icon={<ArchiveRestore size={11} />} label={t('Unarchive all matches')} active={flag('auto_unarchive')} onClick={() => toggleFlag('auto_unarchive')} />
                    <ActionToggle icon={<HardDrive size={11} />} label={t('Update used disk space')} active={flag('update_disk_space')} onClick={() => toggleFlag('update_disk_space')} />
                    <ActionToggle icon={<Video size={11} />} label={t('Create video for all matches')} active={flag('auto_video')} onClick={() => toggleFlag('auto_video')} />
                    <ActionToggle icon={<Upload size={11} />} label={t('Upload all matches')} active={flag('auto_upload')} onClick={() => toggleFlag('auto_upload')} />
                    <ActionToggle icon={<Mail size={11} />} label={t('Email details of all matches')} active={flag('auto_email')} onClick={() => toggleFlag('auto_email')} />
                    <ActionToggle icon={<MessageSquare size={11} />} label={t('Message details of all matches')} active={flag('auto_message')} onClick={() => toggleFlag('auto_message')} />
                    <ActionToggle icon={<Terminal size={11} />} label={t('Execute command on all matches')} active={flag('auto_execute')} onClick={() => toggleFlag('auto_execute')} />
                    <ActionToggle icon={<Trash size={11} />} label={t('Delete all matches')} tone="danger" active={flag('auto_delete')} onClick={() => toggleFlag('auto_delete')} />
                    <ActionToggle icon={<Copy size={11} />} label={t('Copy all matches')} active={flag('auto_copy')} onClick={() => toggleFlag('auto_copy')} />
                    <ActionToggle icon={<Move size={11} />} label={t('Move all matches')} active={flag('auto_move')} onClick={() => toggleFlag('auto_move')} />
                  </div>

                  {s.deleteEverythingRisk && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-danger" role="alert">
                      <AlertTriangle size={12} />
                      {t('No conditions + Delete all matches = every event will be deleted when this filter runs.')}
                    </p>
                  )}

                  {flag('auto_execute') && (
                    <div className="mt-2 flex items-center gap-2">
                      <label htmlFor="filter-cmd" className={clsx(label, 'w-20')}>{t('Command')}</label>
                      <input
                        id="filter-cmd"
                        type="text"
                        maxLength={255}
                        value={c.auto_execute_cmd ?? ''}
                        onChange={(e) => setColumn('auto_execute_cmd', e.target.value)}
                        placeholder="/usr/local/bin/notify.sh %EI%"
                        className={clsx(input, 'flex-1 font-mono')}
                      />
                    </div>
                  )}

                  {flag('auto_email') && (
                    <div className="mt-2 space-y-2 border-s border-border-subtle ps-3">
                      <TextField id="filter-email-to" label={t('Email to')} value={c.email_to ?? ''} onChange={(v) => setColumn('email_to', v)} placeholder="ops@example.com, alerts@example.com" />
                      <TextField id="filter-email-subject" label={t('Subject')} value={c.email_subject ?? ''} onChange={(v) => setColumn('email_subject', v)} placeholder={t('ZoneMinder alert')} />
                      <div className="flex items-start gap-3">
                        <label htmlFor="filter-email-body" className={clsx(label, 'w-20 pt-1')}>{t('Body')}</label>
                        <textarea
                          id="filter-email-body"
                          value={c.email_body ?? ''}
                          onChange={(e) => setColumn('email_body', e.target.value)}
                          placeholder={t('Event %EI% on %MN% at %ED%')}
                          rows={3}
                          className={clsx(input, 'flex-1 font-mono')}
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <label htmlFor="filter-email-format" className={clsx(label, 'w-20')}>{t('Format')}</label>
                        <select
                          id="filter-email-format"
                          value={c.email_format || 'Individual'}
                          onChange={(e) => setColumn('email_format', e.target.value)}
                          className={input}
                        >
                          <option value="Individual">{t('Individual (one email per event)')}</option>
                          <option value="Summary">{t('Summary (one email per run)')}</option>
                        </select>
                      </div>
                      <TextField id="filter-email-server" label={t('Email server')} value={c.email_server ?? ''} onChange={(v) => setColumn('email_server', v || null)} placeholder={t('smtp.example.com (optional override)')} />
                    </div>
                  )}

                  {flag('auto_copy') && (
                    <StorageField id="filter-copy-to" label={t('Copy to')} value={c.auto_copy_to} storage={storage} onChange={(v) => setColumn('auto_copy_to', v)} />
                  )}
                  {flag('auto_move') && (
                    <StorageField id="filter-move-to" label={t('Move to')} value={c.auto_move_to} storage={storage} onChange={(v) => setColumn('auto_move_to', v)} />
                  )}

                  {s.anyActionOn && c.background !== 1 && (
                    <p className="mt-2 text-xs text-fg-dim">
                      {t('Actions only run automatically when "Run in background" is on; otherwise use Execute now.')}
                    </p>
                  )}
                </div>

                {/* Options */}
                <div>
                  <h3 className="mb-2 text-xs font-medium text-fg-muted">{t('Options')}</h3>
                  <div className="flex flex-wrap gap-2">
                    <ActionToggle icon={<Activity size={11} />} label={t('Run in background')} active={flag('background')} onClick={() => toggleFlag('background')} />
                    <ActionToggle icon={<Layers size={11} />} label={t('Run concurrently')} active={flag('concurrent')} onClick={() => toggleFlag('concurrent')} />
                    <ActionToggle icon={<Lock size={11} />} label={t('Lock rows')} active={flag('lock_rows')} onClick={() => toggleFlag('lock_rows')} />
                    <div className="flex items-center gap-2 px-2 py-1 rounded border border-border-subtle text-fg-muted">
                      <Clock size={12} aria-hidden />
                      <label htmlFor="filter-interval" className="text-xs">{t('Execute interval')}</label>
                      <input
                        id="filter-interval"
                        type="number"
                        min={0}
                        value={c.execute_interval}
                        onChange={(e) => setColumn('execute_interval', Math.max(0, parseInt(e.target.value || '0', 10) || 0))}
                        className={clsx(input, 'w-16 py-0.5 text-xs font-mono tabular-nums')}
                      />
                      <span className="text-xs text-fg-dim">{t('seconds')}</span>
                    </div>
                  </div>
                </div>

                {/* Preview */}
                {draftQuery && (
                  <div>
                    <h3 className="mb-2 text-xs font-medium text-fg-muted">{t('Preview')}</h3>
                    <MatchesPreview
                      query={draftQuery}
                      monitors={monitors}
                      reviewSearch={s.reviewSearch}
                      actions={{
                        archive: flag('auto_archive'),
                        unarchive: flag('auto_unarchive'),
                        delete: flag('auto_delete'),
                      }}
                    />
                  </div>
                )}

                {/* Debug — the structured query the backend (or we) derived from the terms */}
                {showDebug && s.debug && (
                  <div data-testid="filter-debug">
                    <h3 className="mb-2 text-xs font-medium text-fg-muted">
                      {s.debug.source === 'backend' ? t('Debug — backend filter AST') : t('Debug — preview AST from the draft terms')}
                    </h3>
                    <pre className="p-2 rounded bg-bg-sunken border border-border-subtle text-fg-muted overflow-x-auto font-mono text-xs whitespace-pre-wrap break-all">
                      {JSON.stringify(s.debug.source === 'backend' ? s.debug.backendAst : s.debug.ast, null, 2)}
                    </pre>
                  </div>
                )}

                {draftQuery && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-fg-dim hover:text-fg">
                      {t('Show raw query JSON')}
                    </summary>
                    <pre className="mt-2 p-2 rounded bg-bg-sunken border border-border-subtle text-fg-muted overflow-x-auto font-mono">
                      {composeQueryJson()}
                    </pre>
                  </details>
                )}
              </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}

function ActionToggle({
  icon, label, active, tone = 'accent', onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: 'accent' | 'danger';
  active: boolean;
  onClick: () => void;
}) {
  // Only the destructive action gets a colour of its own when it is armed.
  const activeCls = tone === 'danger'
    ? 'border-danger bg-danger/10 text-danger'
    : 'border-accent bg-accent/10 text-accent';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 px-2 py-1 text-xs rounded border transition-colors',
        active ? activeCls : 'border-border-subtle text-fg-dim hover:text-fg hover:border-border',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function TextField({
  id, label, value, onChange, placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="text-xs text-fg-dim w-20">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent transition-colors"
      />
    </div>
  );
}

/** Storage-area target for copy / move. 0 is the legacy "Zero" sentinel. */
function StorageField({
  id, label, value, storage, onChange,
}: {
  id: string;
  label: string;
  value: FilterColumns['auto_copy_to'];
  storage: ZmStorage[];
  onChange: (v: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-2 flex items-center gap-3">
      <label htmlFor={id} className="text-xs text-fg-dim w-20">
        {label}
      </label>
      <select
        id={id}
        value={String(value ?? 0)}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        className="w-72 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-fg focus:outline-none focus:border-accent transition-colors cursor-pointer"
      >
        <option value="0">{t('Zero (unspecified)')}</option>
        {storage.map((s) => (
          <option key={s.id} value={String(s.id)}>{s.name} — {s.path}</option>
        ))}
      </select>
    </div>
  );
}
