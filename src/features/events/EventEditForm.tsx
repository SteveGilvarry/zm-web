import { useState, type FormEvent } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { fieldClasses, LABEL } from '@/components/common/styles';

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

const inputCls = fieldClasses('md');

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
      <form onSubmit={submit} className="space-y-3" data-testid="event-edit-form">
        {bulk && (
          <p className="text-xs text-fg-dim">
            {t('Blank fields are left unchanged on every selected event.')}
          </p>
        )}
        <label className="block space-y-1">
          <span className={LABEL}>{t('Name')}</span>
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
          <span className={LABEL}>{t('Cause')}</span>
          <input
            className={inputCls}
            value={cause}
            onChange={(e) => setCause(e.target.value)}
            placeholder={bulk ? t('Leave unchanged') : undefined}
            aria-label={t('Event cause')}
          />
        </label>
        <label className="block space-y-1">
          <span className={LABEL}>{t('Notes')}</span>
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
            <legend className={LABEL}>{t('Archived')}</legend>
            <div className="flex flex-wrap gap-3 text-sm text-fg-muted">
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
          <p role="alert" className="text-sm text-danger">{error}</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button onClick={onClose} disabled={pending}>
            {t('Cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {t('Save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
