import { useState, type FormEvent } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Users, X, Save, Loader2 } from 'lucide-react';
import { getValidParentOptions } from './tree';
import type { Group } from '@/api/groups';

export interface GroupEditDialogProps {
  /** When set, controls visibility. Always renders nothing when false. */
  open: boolean;
  /**
   * The group currently being edited. `null` means "create new".
   * Used to seed initial form values + to filter the parent dropdown.
   */
  editing: Group | null;
  /** All known groups — needed to render the parent dropdown. */
  groups: Group[];
  onClose: () => void;
  /**
   * Called when the user clicks Save. The host route is responsible for
   * routing this to `createGroup` (when `editing === null`) or
   * `updateGroup` otherwise, then closing the dialog.
   *
   * `parentId` is `null` for "no parent".
   */
  onSubmit: (input: { name: string; parentId: number | null }) => void;
  /** When true, disables the submit button + shows a spinner. */
  pending?: boolean;
  /** Optional error message shown above the buttons. */
  error?: string | null;
}

/**
 * Modal dialog for creating + editing a group.
 *
 * Fields:
 *   - Name      — text input, required.
 *   - Parent    — select. Excludes the editing group + its descendants
 *                 (cycle prevention).
 *
 * Monitor membership is intentionally NOT here — the existing main
 * route keeps that on its right panel for the selected group, which
 * sidesteps the round-trip-per-toggle UX a chip control would force.
 *
 * The form is keyed on the editing target and unmounted while closed, so
 * every open (and every switch between groups) starts from fresh state
 * without an effect re-seeding it.
 */
export function GroupEditDialog({ open, editing, ...rest }: GroupEditDialogProps) {
  if (!open) return null;
  return <GroupEditForm key={editing?.id ?? 'new'} editing={editing} {...rest} />;
}

type GroupEditFormProps = Omit<GroupEditDialogProps, 'open'>;

function GroupEditForm({
  editing,
  groups,
  onClose,
  onSubmit,
  pending = false,
  error = null,
}: GroupEditFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(editing?.name ?? '');
  const [parentId, setParentId] = useState<number | null>(editing?.parent_id ?? null);

  const options = getValidParentOptions(groups, editing?.id ?? null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ name: trimmed, parentId });
  };

  const title = editing ? t('Group — {{name}}', { name: editing.name }) : t('New group');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editing ? t('Edit group') : t('Create group')}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-cyan/40 bg-panel/95 backdrop-blur-md shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-cyan" />
            <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Close')}
            className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
          >
            <X size={14} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <label
              htmlFor="group-name"
              className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted w-24 flex-shrink-0"
            >
              {t('Name')}
            </label>
            <input
              id="group-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('Front Yard')}
              maxLength={64}
              className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
            />
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="group-parent"
              className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted w-24 flex-shrink-0"
            >
              {t('Parent')}
            </label>
            <select
              id="group-parent"
              value={parentId === null ? '' : String(parentId)}
              onChange={(e) => setParentId(e.target.value === '' ? null : Number(e.target.value))}
              className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
            >
              <option value="">{t('— None (top level) —')}</option>
              {options.map(({ group, depth }) => (
                <option key={group.id} value={group.id}>
                  {'  '.repeat(depth)}
                  {depth > 0 ? '↳ ' : ''}
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-md bg-crimson/15 border border-crimson/40 px-3 py-2 text-xs text-crimson"
            >
              {error}
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-subtle">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded border border-border-subtle text-text-muted hover:text-text-primary hover:border-text-secondary/50 transition-colors"
          >
            {t('Cancel')}
          </button>
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border-2',
              'border-cyan/60 bg-cyan/15 text-cyan',
              'hover:bg-cyan/25 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {pending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {t('Save')}
          </button>
        </footer>
      </form>
    </div>
  );
}
