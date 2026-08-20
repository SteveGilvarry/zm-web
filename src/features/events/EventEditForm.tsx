import { useState, type FormEvent } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';

export type ArchivedChoice = 'keep' | 'archive' | 'unarchive';

export interface EventEditValues {
  name: string;
  cause: string;
  notes: string;
  archived: ArchivedChoice;
}

interface EventEditFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: EventEditValues) => void;
  title: string;
  /** Starting values; omitted fields start blank. */
  initial?: Partial<Pick<EventEditValues, 'name' | 'cause' | 'notes'>>;
  /**
   * Bulk mode: every field is optional and a blank one means "leave as is";
   * the Archived radio appears. Single mode requires a name.
   */
  bulk?: boolean;
  pending?: boolean;
  error?: string | null;
}

const inputCls =
  'w-full px-3 py-2 text-sm rounded-lg bg-surface border border-border-subtle text-text-primary ' +
  'placeholder:text-text-muted focus:outline-none focus:border-cyan/50';

/**
 * Name / Cause / Notes editor for one event, or — in bulk mode — for a whole
 * selection, where blank fields are skipped and Archived is a tri-state.
 * Mirrors legacy `?view=eventdetail`.
 */
export function EventEditForm({
  isOpen, onClose, onSubmit, title, initial, bulk = false, pending = false, error,
}: EventEditFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [cause, setCause] = useState(initial?.cause ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [archived, setArchived] = useState<ArchivedChoice>('keep');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!bulk && !name.trim()) return;
    onSubmit({ name, cause, notes, archived });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-4" data-testid="event-edit-form">
        {bulk && (
          <p className="text-xs text-text-muted">
            {t('Blank fields are left unchanged on every selected event.')}
          </p>
        )}
        <label className="block space-y-1">
          <span className="text-xs font-mono uppercase tracking-[0.16em] text-text-muted">{t('Name')}</span>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required={!bulk}
            placeholder={bulk ? t('Leave unchanged') : undefined}
            aria-label={t('Event name')}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-mono uppercase tracking-[0.16em] text-text-muted">{t('Cause')}</span>
          <input
            className={inputCls}
            value={cause}
            onChange={(e) => setCause(e.target.value)}
            placeholder={bulk ? t('Leave unchanged') : undefined}
            aria-label={t('Event cause')}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-mono uppercase tracking-[0.16em] text-text-muted">{t('Notes')}</span>
          <textarea
            className={clsx(inputCls, 'min-h-24 resize-y')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={bulk ? t('Leave unchanged') : undefined}
            aria-label={t('Event notes')}
          />
        </label>
        {bulk && (
          <fieldset className="space-y-1">
            <legend className="text-xs font-mono uppercase tracking-[0.16em] text-text-muted">{t('Archived')}</legend>
            <div className="flex flex-wrap gap-3 text-sm text-text-secondary">
              {([
                ['keep', t('Leave unchanged')],
                ['archive', t('Archive')],
                ['unarchive', t('Unarchive')],
              ] as const).map(([value, label]) => (
                <label key={value} className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="archived"
                    value={value}
                    checked={archived === value}
                    onChange={() => setArchived(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {error && (
          <p role="alert" className="text-sm text-crimson">{error}</p>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-panel border border-border-subtle text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
          >
            {t('Cancel')}
          </button>
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan text-void hover:bg-cyan-dim transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            {t('Save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
