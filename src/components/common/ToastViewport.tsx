import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useToastStore, type Toast } from './toastStore';

/**
 * Renders queued toasts bottom-end of the viewport. Mount once per shell.
 * Errors are announced assertively, the rest politely.
 */
export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 end-4 z-[60] flex flex-col gap-2 w-[min(24rem,calc(100vw-2rem))] pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const { t } = useTranslation();
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    if (toast.duration <= 0) return;
    const timer = setTimeout(() => dismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, dismiss]);

  const Icon = toast.tone === 'error' ? AlertCircle : toast.tone === 'success' ? CheckCircle2 : Info;
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={clsx(
        'pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg border shadow-elevated text-sm',
        'bg-surface text-text-primary',
        toast.tone === 'error' && 'border-crimson/50',
        toast.tone === 'success' && 'border-emerald/50',
        toast.tone === 'info' && 'border-border-subtle',
      )}
    >
      <Icon
        size={16}
        aria-hidden
        className={clsx(
          'mt-0.5 shrink-0',
          toast.tone === 'error' && 'text-crimson',
          toast.tone === 'success' && 'text-emerald',
          toast.tone === 'info' && 'text-cyan',
        )}
      />
      <p className="flex-1 min-w-0 break-words">{toast.message}</p>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label={t('Dismiss')}
        className="p-0.5 rounded text-text-muted hover:text-text-primary transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}
