import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
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
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <p className="text-sm text-text-secondary mb-6">{message}</p>
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className={clsx(
            'px-4 py-2 rounded-lg text-sm font-medium',
            'bg-panel border border-border-subtle',
            'text-text-secondary hover:text-text-primary',
            'transition-colors',
            isLoading && 'opacity-50 cursor-not-allowed'
          )}
        >
          {t('Cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isLoading}
          className={clsx(
            'px-4 py-2 rounded-lg text-sm font-medium',
            'transition-colors flex items-center gap-2',
            variant === 'danger'
              ? 'bg-crimson hover:bg-crimson/80 text-white'
              : 'bg-amber hover:bg-amber/80 text-void',
            isLoading && 'opacity-50 cursor-not-allowed'
          )}
        >
          {isLoading && <Loader2 size={14} className="animate-spin" />}
          {confirmText ?? t('Confirm')}
        </button>
      </div>
    </Modal>
  );
}
