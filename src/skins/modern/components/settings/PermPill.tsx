import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

/** A permission level is state, so it keeps its colour; `None` is the quiet one. */
const permissionTone: Record<string, string> = {
  Edit: 'bg-warn/15 text-warn',
  View: 'bg-accent/15 text-accent',
  Create: 'bg-ok/15 text-ok',
  None: 'bg-surface-2 text-fg-dim',
};

/** Permission wire values are fixed; only the display label is translated. */
function usePermLabel(): (v: string) => string {
  const { t } = useTranslation();
  return (v) => {
    switch (v) {
      case 'Edit': return t('Edit');
      case 'View': return t('View');
      case 'Create': return t('Create');
      case 'None': return t('None');
      default: return v;
    }
  };
}

export function PermPill({ value }: { value: string }) {
  const label = usePermLabel();
  const v = value || 'None';
  return (
    <span
      className={clsx(
        'text-xs font-medium px-2 py-0.5 rounded',
        permissionTone[v] || permissionTone.None,
      )}
    >
      {label(v)}
    </span>
  );
}
