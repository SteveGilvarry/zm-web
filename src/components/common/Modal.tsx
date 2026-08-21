import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { X } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal dialog: `role="dialog"` + `aria-modal`, labelled by its
 * title, traps Tab inside, moves focus in on open and restores it on close,
 * closes on Escape and on overlay click.
 */
export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Callers usually pass a fresh arrow every render; keep the latest one in a
  // ref so the trap effect runs once per open, not once per keystroke
  // (re-running it would yank focus back to the first field).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;

    // Move focus into the dialog: first field if there is one, else the panel.
    const focusables = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
    const first = focusables().find((el) => !el.hasAttribute('data-modal-close'));
    (first ?? dialog)?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || active === dialog)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx(
          'w-full max-w-lg outline-none',
          'bg-surface border border-border-subtle rounded-xl',
          'shadow-elevated',
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <h2 id={titleId} className="text-lg font-semibold text-fg">{title}</h2>
          <Button
            variant="ghost"
            size="sm"
            icon
            onClick={onClose}
            data-modal-close
            aria-label={t('Close')}
          >
            <X size={18} aria-hidden />
          </Button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
