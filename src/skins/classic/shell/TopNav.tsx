import { useState } from 'react';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import {
  LayoutDashboard, RefreshCcw, LayoutGrid, Film, Video, Settings, ScrollText,
  UsersRound, Filter as FilterIcon, FileText, ShieldCheck, UserRound, LogOut,
  ChevronUp, ChevronDown, Link2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { logout as apiLogout } from '@/api/auth';
import { usePerms } from '@/features/auth/usePerms';
import { useCurrentUsername, useMe } from '@/features/auth/useMe';
import { useZmConfig } from '@/features/config/useZmConfig';
import { canSeeNav } from '@/features/nav/navPerms';
import { useSystemMenu } from '@/features/nav/useSystemMenu';
import { Button } from '@/components/common/Button';
import { useLogState, type LogState } from '@/features/logs/useLogState';
import { useUiStore } from '@/stores/ui';
import { ClassicBrandMenu } from './BrandMenu';
import { ClassicStatusButton } from './StatusButton';
import { ClassicLogoutModal } from './LogoutModal';

interface NavItem { icon: ReactNode; label: string; to: string; external?: boolean }

/**
 * Classic ZoneMinder top navigation. Same items, order and labels as the
 * legacy navbar (`getNavBarHTML`), monochrome icons in place of Material
 * Icons. Legacy reads the `MenuItems` table (Options → Menu: hidden rows,
 * custom labels, links and order); once `GET /system/menu` has answered
 * with rows, the list below gives way to it. Entries with no page here
 * (Devices, Snapshots, Map…) are left out, as a link to nowhere helps nobody.
 */
function useNavItems(): NavItem[] {
  const { t } = useTranslation();
  const { entries } = useSystemMenu();
  const s = 15;
  const defaults: NavItem[] = [
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
  if (!entries || entries.length === 0) return defaults;
  const iconByRoute = new Map(defaults.map((d) => [d.to, d.icon]));
  return entries
    .filter((e) => e.link != null)
    .map((e) => ({
      icon: iconByRoute.get(e.link!) ?? <Link2 size={s} />,
      label: e.label,
      to: e.link!,
      external: e.external,
    }));
}

/** `logState()` → the legacy nav classes (`text-success/warning/danger`). */
const LOG_STATE_CLASS: Record<LogState, string> = {
  ok: 'text-[#05c46b]',
  alert: 'text-[#ffa801]',
  alarm: 'text-[#ff3f34]',
};

export function ClassicTopNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { clearAuth } = useAuthStore();
  const username = useCurrentUsername();
  const { data: me } = useMe();
  const { perms, can } = usePerms();
  const [logoutOpen, setLogoutOpen] = useState(false);
  // `getAccountCircleHTML`: the name is a link to the logout modal only
  // with builtin auth; with remote auth it is plain text.
  const authType = useZmConfig('ZM_AUTH_TYPE', 'builtin');
  const statBarOpen = useUiStore((s) => s.classicStatBarOpen);
  const toggleStatBar = useUiStore((s) => s.toggleClassicStatBar);
  // Same canView() gating as the legacy navbar.
  const items = useNavItems().filter((i) => i.external || canSeeNav(perms, i.to));
  // Legacy colours the Log item by `logState()`; only System viewers see it.
  const logState = useLogState(can('system', 'View') && items.some((i) => i.to === '/logs'));

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  const handleLogout = async () => {
    setLogoutOpen(false);
    await apiLogout().catch(() => undefined);
    clearAuth();
    void navigate({ to: '/login' });
  };
  // Legacy's Config button posts `action=config`, which lands on the
  // operator's own user page (`?view=user&uid=`).
  const handleConfig = () => {
    setLogoutOpen(false);
    void navigate({ to: '/settings/users', search: { uid: me?.id } });
  };

  return (
    <header className="bg-classic-nav text-classic-nav-fg border-b border-black/40 sticky top-0 z-30">
      <div className="px-4 py-2 flex items-center gap-6 flex-wrap">
        <ClassicBrandMenu />
        <nav aria-label={t('Main')} className="flex-1">
          <ul className="flex items-center gap-1 flex-wrap">
            {items.map((item) => (
              <li key={item.to}>
                {item.external ? (
                  <a
                    href={item.to}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors hover:bg-white/10 text-classic-nav-link"
                  >
                    <span aria-hidden className="leading-none">{item.icon}</span>
                    <span>{item.label}</span>
                  </a>
                ) : (
                <Link
                  to={item.to}
                  aria-current={isActive(item.to) ? 'page' : undefined}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors',
                    'hover:bg-white/10',
                    isActive(item.to) && 'bg-white/15 text-classic-nav-fg',
                    !isActive(item.to) && 'text-classic-nav-link',
                    item.to === '/logs' && LOG_STATE_CLASS[logState],
                  )}
                  data-log-state={item.to === '/logs' ? logState : undefined}
                >
                  <span aria-hidden className="leading-none">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-3 text-sm">
          {/* `account_circle <name>` (`getAccountCircleHTML`): opens the logout modal. */}
          {username && authType === 'builtin' && (
            <button
              type="button"
              onClick={() => setLogoutOpen(true)}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-classic-nav-link hover:bg-white/10 hover:text-classic-nav-fg"
            >
              <UserRound size={15} aria-hidden />
              <span>{username}</span>
            </button>
          )}
          {username && authType !== 'builtin' && (
            <span className="flex items-center gap-1.5 text-classic-nav-link">
              <UserRound size={15} aria-hidden />
              <span>{username}</span>
            </span>
          )}
          {/* No name to hang the modal on (a token without a `user` claim,
              or remote auth): a plain log-out verb so the session can still end. */}
          {(!username || authType !== 'builtin') && (
            <Button
              variant="ghost"
              size="sm"
              icon
              onClick={handleLogout}
              className="text-classic-nav-link hover:text-classic-nav-fg hover:bg-white/10"
              title={t('Log out')}
              aria-label={t('Log out')}
            >
              <LogOut size={15} className="rtl:-scale-x-100" aria-hidden />
            </Button>
          )}
          {can('system', 'View') && <ClassicStatusButton canChange={can('system', 'Edit')} />}
          {/* Legacy header-flip chevron (`#flip`, cookie `zmHeaderFlip`): hides
              the stat strip and stays hidden until flipped back. */}
          <button
            type="button"
            onClick={toggleStatBar}
            aria-expanded={statBarOpen}
            aria-controls="classic-stat-bar"
            title={statBarOpen ? t('Hide server stats') : t('Show server stats')}
            aria-label={statBarOpen ? t('Hide server stats') : t('Show server stats')}
            className="p-1 text-classic-nav-link hover:text-classic-nav-fg"
          >
            {statBarOpen ? <ChevronUp size={15} aria-hidden /> : <ChevronDown size={15} aria-hidden />}
          </button>
        </div>
      </div>

      <ClassicLogoutModal
        isOpen={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        username={username}
        canViewSystem={can('system', 'View')}
        onLogout={() => { void handleLogout(); }}
        onConfig={handleConfig}
      />
    </header>
  );
}
