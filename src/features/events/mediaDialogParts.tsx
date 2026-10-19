import type { ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { Button } from '@/components/common/Button';
import { ClassicButton } from '@/skins/classic/components/events/primitives';
import type { MediaDialogVariant } from './eventMedia';

/**
 * The dialogs' buttons: legacy's flat Bootstrap buttons in classic, the
 * app's Button in modern. Everything else in the dialogs is plain markup on
 * the semantic tokens both skins bind.
 */
export function MediaButton({
  variant, primary = false, className, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant: MediaDialogVariant; primary?: boolean }) {
  if (variant === 'classic') {
    return <ClassicButton tone={primary ? 'primary' : 'default'} className={className} {...rest} />;
  }
  return <Button variant={primary ? 'primary' : 'secondary'} size="sm" className={clsx('gap-1.5', className)} {...rest} />;
}

/** Progress / result line under a dialog's form (legacy `#exportProgress`). */
export function MediaStatus({ tone, children }: { tone: 'busy' | 'ok' | 'error'; children: React.ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={clsx(
        'text-sm font-medium',
        tone === 'busy' && 'text-warn',
        tone === 'ok' && 'text-ok',
        tone === 'error' && 'text-danger',
      )}
    >
      {children}
    </p>
  );
}
