import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { PermFeature, PermLevel } from '@/types';
import { usePerms } from './usePerms';

interface RequirePermProps {
  feature: PermFeature;
  level: PermLevel;
  /** Rendered instead of `children` when the level is not met. Defaults to
   *  nothing; pass `fallback="message"` for the standard "no permission" note. */
  fallback?: ReactNode | 'message';
  children: ReactNode;
}

/**
 * Render `children` only when the user holds `level` on `feature`.
 *
 *   <RequirePerm feature="events" level="Edit"><DeleteButton /></RequirePerm>
 *   <RequirePerm feature="system" level="View" fallback="message">…</RequirePerm>
 */
export function RequirePerm({ feature, level, fallback, children }: RequirePermProps) {
  const { can } = usePerms();
  if (can(feature, level)) return <>{children}</>;
  if (fallback === 'message') return <NoPermission />;
  return <>{fallback ?? null}</>;
}

export function NoPermission() {
  const { t } = useTranslation();
  return (
    <p role="status" className="text-sm text-fg-dim">
      {t('You do not have permission to view this.')}
    </p>
  );
}
