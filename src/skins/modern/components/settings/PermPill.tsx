import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

const permissionColors: Record<string, string> = {
  Edit: 'bg-amber/20 text-amber',
  View: 'bg-cyan/20 text-cyan',
  Create: 'bg-emerald/20 text-emerald',
  None: 'bg-panel text-text-muted',
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
        permissionColors[v] || permissionColors.None,
      )}
    >
      {label(v)}
    </span>
  );
}
