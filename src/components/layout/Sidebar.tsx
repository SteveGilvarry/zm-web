import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Monitor,
  Video,
  LayoutGrid,
  Film,
  RefreshCcw,
  Settings,
  Shield,
  HardDrive,
  Users,
  UsersRound,
  ScrollText,
  Filter as FilterIcon,
  FileText,
  ShieldCheck,
  Power,
  KeyRound,
  LogOut,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { logout as apiLogout } from '@/api/auth';
import { usePerms } from '@/features/auth/usePerms';
import { ChangePasswordDialog } from '@/features/auth/ChangePasswordDialog';
import { useCurrentUsername } from '@/features/auth/useMe';
import { canSeeNav } from '@/features/nav/navPerms';
import { Button } from '@/components/common/Button';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
  badge?: number;
}

/** Nav labels are built inside a hook so `t()` sees literal keys. */
function useNavItems(): { main: NavItem[]; settings: NavItem[] } {
  const { t } = useTranslation();
  return {
    main: [
      { label: t('Console'), icon: <LayoutDashboard size={20} />, path: '/' },
      { label: t('Monitors'), icon: <Monitor size={20} />, path: '/monitors' },
      { label: t('Events'), icon: <Video size={20} />, path: '/events' },
      { label: t('Montage'), icon: <LayoutGrid size={20} />, path: '/montage' },
      { label: t('Review'), icon: <Film size={20} />, path: '/montagereview' },
      { label: t('Cycle'), icon: <RefreshCcw size={20} />, path: '/cycle' },
      { label: t('Groups'), icon: <UsersRound size={20} />, path: '/groups' },
      { label: t('Filters'), icon: <FilterIcon size={20} />, path: '/filters' },
      { label: t('Reports'), icon: <FileText size={20} />, path: '/reports' },
      { label: t('Audit'), icon: <ShieldCheck size={20} />, path: '/audit' },
      { label: t('Log'), icon: <ScrollText size={20} />, path: '/logs' },
    ],
    settings: [
      { label: t('Settings'), icon: <Settings size={20} />, path: '/settings' },
      { label: t('Storage'), icon: <HardDrive size={20} />, path: '/settings/storage' },
      { label: t('Users'), icon: <Users size={20} />, path: '/settings/users' },
      { label: t('Servers'), icon: <Shield size={20} />, path: '/settings/servers' },
      { label: t('Run State'), icon: <Power size={20} />, path: '/settings/state' },
    ],
  };
}

const DESKTOP_QUERY = '(min-width: 1024px)';

/** Tailwind's `lg` breakpoint, as state: the drawer only exists below it. */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(DESKTOP_QUERY);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

interface SidebarProps {
  /** Drawer state below `lg`; ignored on desktop. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const { t } = useTranslation();
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const isDesktop = useIsDesktop();
  // The drawer always shows labels; collapse is a desktop-only state.
  const collapsed = isDesktop && sidebarCollapsed;
  const router = useRouterState();
  const navigate = useNavigate();
  const currentPath = router.location.pathname;
  const { clearAuth } = useAuthStore();
  const username = useCurrentUsername();
  const { perms } = usePerms();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const items = useNavItems();
  const asideRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Drawer a11y: Escape closes; focus moves in on open and back out on close.
  const drawerActive = mobileOpen && !isDesktop;
  useEffect(() => {
    if (!drawerActive) return;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onMobileClose?.();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [drawerActive, onMobileClose]);
  // Legacy canView() rules: hide what the user cannot open.
  const navItems = items.main.filter((i) => canSeeNav(perms, i.path));
  const settingsItems = items.settings.filter((i) => canSeeNav(perms, i.path));

  const handleLogout = async () => {
    // Tell the backend first (best effort — a dead backend must not trap
    // the operator in a logged-in UI), then drop local state and navigate.
    await apiLogout().catch(() => undefined);
    clearAuth();
    void navigate({ to: '/login' });
  };

  return (
    <aside
      id="app-sidebar"
      ref={asideRef}
      aria-label={t('Sidebar')}
      aria-hidden={!isDesktop && !mobileOpen ? true : undefined}
      className={clsx(
        'fixed start-0 top-0 z-40 h-screen flex flex-col',
        'bg-surface border-e border-border-subtle',
        'transition-[transform,width] duration-300 ease-out-expo',
        collapsed ? 'w-16' : 'w-56',
        // Off-canvas below lg; always in place from lg up.
        mobileOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full',
        'lg:translate-x-0 lg:rtl:translate-x-0',
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border-subtle">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Shield className="text-accent" size={24} aria-hidden />
            <span className="font-mono font-semibold text-accent tracking-tight">
              ZM<span className="text-fg-muted">dash</span>
            </span>
          </div>
        )}
        {collapsed && <Shield className="text-accent mx-auto" size={24} aria-hidden />}
        {onMobileClose && (
          <Button
            ref={closeRef}
            variant="ghost"
            size="sm"
            icon
            onClick={onMobileClose}
            aria-label={t('Close menu')}
            className="lg:hidden"
          >
            <X size={18} aria-hidden />
          </Button>
        )}
      </div>

      {/* Collapse toggle (desktop only) */}
      <Button
        variant="secondary"
        size="sm"
        icon
        onClick={toggleSidebar}
        aria-label={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}
        aria-expanded={!collapsed}
        className={clsx(
          'absolute -end-3 top-20 z-50 hidden lg:flex',
          'w-6 h-6 p-0 rounded-full border-border hover:bg-surface-3',
        )}
      >
        {collapsed
          ? <ChevronRight size={14} className="rtl:-scale-x-100" aria-hidden />
          : <ChevronLeft size={14} className="rtl:-scale-x-100" aria-hidden />}
      </Button>

      {/* Main navigation */}
      <nav aria-label={t('Main')} className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        <div className="space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              item={item}
              isActive={currentPath === item.path}
              collapsed={collapsed}
            />
          ))}
        </div>

        {settingsItems.length > 0 && <div className="my-4 mx-2 border-t border-border-subtle" />}

        <div className="space-y-1">
          {settingsItems.map((item) => (
            <NavLink
              key={item.path}
              item={item}
              isActive={
                item.path === '/settings'
                  ? currentPath === '/settings' || currentPath === '/settings/'
                  : currentPath.startsWith(item.path)
              }
              collapsed={collapsed}
            />
          ))}
        </div>
      </nav>

      {/* User section */}
      <div className="p-2 border-t border-border-subtle">
        <div
          className={clsx(
            'flex items-center gap-3 px-3 py-2 rounded-lg',
            'bg-surface-2/50'
          )}
        >
          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
            <span className="text-accent font-medium text-sm">
              {username?.charAt(0).toUpperCase() || '?'}
            </span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-fg truncate">
                {username || t('Unknown')}
              </p>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            icon
            onClick={() => setPasswordOpen(true)}
            className="hover:text-accent hover:bg-accent/10"
            title={t('Change password')}
            aria-label={t('Change password')}
          >
            <KeyRound size={16} aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon
            onClick={handleLogout}
            className="hover:text-danger hover:bg-danger/10"
            title={t('Log out')}
            aria-label={t('Log out')}
          >
            <LogOut size={16} className="rtl:-scale-x-100" aria-hidden />
          </Button>
        </div>
      </div>

      <ChangePasswordDialog isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </aside>
  );
}

function NavLink({
  item,
  isActive,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      to={item.path}
      aria-current={isActive ? 'page' : undefined}
      className={clsx(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg',
        'transition-all duration-fast',
        'group relative',
        isActive
          ? 'bg-accent/10 text-accent'
          : 'text-fg-muted hover:text-fg hover:bg-surface-2'
      )}
    >
      {/* Active indicator */}
      {isActive && (
        <div className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-accent rounded-e" />
      )}

      <span
        className={clsx(
          'flex-shrink-0',
          isActive ? 'text-accent' : 'text-fg-dim group-hover:text-fg-muted'
        )}
      >
        {item.icon}
      </span>

      {!collapsed && (
        <span className="font-medium text-sm">{item.label}</span>
      )}

      {!collapsed && item.badge !== undefined && item.badge > 0 && (
        <span className="ms-auto px-2 py-0.5 text-label font-mono bg-danger/20 text-danger rounded">
          {item.badge}
        </span>
      )}

      {/* Tooltip for collapsed state */}
      {collapsed && (
        <div
          role="tooltip"
          className={clsx(
            'absolute start-full ms-2 px-2 py-1 rounded',
            'bg-surface-3 text-fg text-sm font-medium',
            'opacity-0 invisible group-hover:opacity-100 group-hover:visible',
            'transition-all duration-fast',
            'whitespace-nowrap z-50',
            'shadow-elevated'
          )}
        >
          {item.label}
        </div>
      )}
    </Link>
  );
}
