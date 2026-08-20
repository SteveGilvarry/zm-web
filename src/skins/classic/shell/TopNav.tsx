import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import {
  LayoutDashboard, RefreshCcw, LayoutGrid, Film, Video, Settings, ScrollText,
  UsersRound, Filter as FilterIcon, FileText, ShieldCheck, UserRound, LogOut,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { logout as apiLogout } from '@/api/auth';
import { SystemRunningToggle } from '@/components/system/SystemRunningToggle';
import { usePerms } from '@/features/auth/usePerms';
import { canSeeNav } from '@/features/nav/navPerms';

/**
 * Classic ZoneMinder top navigation. Same items, order and labels as the
 * legacy navbar (`getNavBarHTML`), monochrome icons in place of Material
 * Icons.
 */
function useNavItems(): Array<{ icon: ReactNode; label: string; to: string }> {
  const { t } = useTranslation();
  const s = 15;
  return [
    { icon: <LayoutDashboard size={s} />, label: t('Console'), to: '/' },
    { icon: <RefreshCcw size={s} />, label: t('Cycle'), to: '/cycle' },
    { icon: <LayoutGrid size={s} />, label: t('Montage'), to: '/montage' },
    { icon: <Film size={s} />, label: t('Montage Review'), to: '/montagereview' },
    { icon: <Video size={s} />, label: t('Events'), to: '/events' },
    { icon: <Settings size={s} />, label: t('Options'), to: '/settings' },
    { icon: <ScrollText size={s} />, label: t('Log'), to: '/logs' },
    { icon: <UsersRound size={s} />, label: t('Groups'), to: '/groups' },
    { icon: <FilterIcon size={s} />, label: t('Filters'), to: '/filters' },
    { icon: <FileText size={s} />, label: t('Reports'), to: '/reports' },
    { icon: <ShieldCheck size={s} />, label: t('Audit Events Report'), to: '/audit' },
  ];
}

export function ClassicTopNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, clearAuth } = useAuthStore();
  const { perms, can } = usePerms();
  // Same canView() gating as the legacy navbar.
  const items = useNavItems().filter((i) => canSeeNav(perms, i.to));

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  const handleLogout = async () => {
    await apiLogout().catch(() => undefined);
    clearAuth();
    void navigate({ to: '/login' });
  };

  return (
    <header className="bg-[#3c4956] text-white border-b border-black/40 sticky top-0 z-30">
      <div className="px-4 py-2 flex items-center gap-6 flex-wrap">
        <div className="text-2xl font-semibold tracking-tight text-amber-400">
          ZoneMinder
        </div>
        <nav aria-label={t('Main')} className="flex-1">
          <ul className="flex items-center gap-1 flex-wrap">
            {items.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={isActive(item.to) ? 'page' : undefined}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors',
                    'hover:bg-white/10',
                    isActive(item.to) && 'bg-white/15 text-cyan-300',
                    !isActive(item.to) && 'text-cyan-200',
                  )}
                >
                  <span aria-hidden className="leading-none">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-3 text-sm">
          {user?.user && (
            <span className="flex items-center gap-1.5 text-cyan-100">
              <UserRound size={15} aria-hidden />
              <span>{user.user}</span>
            </span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1 hover:underline text-cyan-200"
            title={t('Log out')}
            aria-label={t('Log out')}
          >
            <LogOut size={15} className="rtl:-scale-x-100" aria-hidden />
          </button>
          {can('system', 'Edit') && <SystemRunningToggle tone="light" />}
        </div>
      </div>
    </header>
  );
}
