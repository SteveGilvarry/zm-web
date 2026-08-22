import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { optionsTabLabel, type OptionsTab } from '@/features/settings/optionsTabs';

interface OptionsRailProps {
  tabs: OptionsTab[];
  /** Key of the highlighted tab (a category key, `display`, or a page key). */
  active: string | null;
  /**
   * When the rail lives on the Options page itself, category tabs switch
   * in place through this callback; elsewhere they link to
   * `/settings?category=…`.
   */
  onSelectCategory?: (key: string) => void;
}

/**
 * Legacy `options.php` left-hand tab list: one pill per config category in
 * the legacy order (bandwidth tabs omitted) plus the admin sub-pages.
 */
export function OptionsRail({ tabs, active, onSelectCategory }: OptionsRailProps) {
  const { t } = useTranslation();
  const itemCls = (isActive: boolean) =>
    clsx(
      'block w-full text-start px-3 py-1.5 text-sm rounded-sm border-s-4 transition-colors',
      isActive
        ? 'bg-zinc-200 border-zinc-700 text-zinc-900 font-semibold'
        : 'border-transparent text-cyan-800 hover:bg-zinc-100 hover:underline',
    );

  return (
    <nav aria-label={t('Options')} className="w-44 shrink-0">
      <ul className="bg-white rounded border border-zinc-300 py-1">
        {tabs.map((tab) => {
          const label = optionsTabLabel(t, tab.key);
          const isActive = tab.key === active;
          const inPlace = onSelectCategory && (tab.kind === 'category' || tab.key === 'display');
          return (
            <li key={tab.key}>
              {inPlace ? (
                <button
                  type="button"
                  onClick={() => onSelectCategory(tab.key === 'display' ? 'display' : (tab as { category: string }).category)}
                  aria-current={isActive ? 'page' : undefined}
                  className={itemCls(isActive)}
                >
                  {label}
                </button>
              ) : tab.kind === 'page' && tab.key !== 'display' ? (
                <Link to={tab.to} aria-current={isActive ? 'page' : undefined} className={itemCls(isActive)}>
                  {label}
                </Link>
              ) : (
                <Link
                  to="/settings"
                  search={(prev: Record<string, unknown>) => ({
                    ...prev,
                    category: tab.kind === 'category' ? tab.category : 'display',
                  })}
                  aria-current={isActive ? 'page' : undefined}
                  className={itemCls(isActive)}
                >
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
