import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  variant?: 'danger' | 'warning';
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  variant = 'danger',
  isLoading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  // Enter confirms, as it does in the legacy modals. Focus lands on Cancel
  // when the dialog opens, so this has to pre-empt that button's own default
  // action rather than wait for it.
  const confirmRef = useRef(onConfirm);
  useEffect(() => { confirmRef.current = onConfirm; }, [onConfirm]);
  useEffect(() => {
    if (!isOpen || isLoading) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return;
      e.preventDefault();
      confirmRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isLoading]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <p className="text-sm text-fg-muted mb-6">{message}</p>
      <div className="flex items-center justify-end gap-3">
        <Button onClick={onClose} disabled={isLoading}>
          {t('Cancel')}
        </Button>
        {/* Warning keeps the amber fill; `--warn-fg` is the AA-checked
            foreground for it, which `text-white` was not. */}
        <Button
          variant={variant === 'danger' ? 'danger' : 'secondary'}
          onClick={onConfirm}
          disabled={isLoading}
          className={variant === 'warning' ? 'bg-warn text-warn-fg border-warn hover:bg-warn-dim' : undefined}
        >
          {isLoading && <Loader2 size={14} className="animate-spin" />}
          {confirmText ?? t('Confirm')}
        </Button>
      </div>
    </Modal>
  );
}
