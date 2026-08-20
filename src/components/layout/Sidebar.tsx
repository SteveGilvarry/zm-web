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
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { logout as apiLogout } from '@/api/auth';
import { usePerms } from '@/features/auth/usePerms';
import { canSeeNav } from '@/features/nav/navPerms';

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

export function Sidebar() {
  const { t } = useTranslation();
  const { sidebarCollapsed: collapsed, toggleSidebar } = useUiStore();
  const router = useRouterState();
  const navigate = useNavigate();
  const currentPath = router.location.pathname;
  const { user, clearAuth } = useAuthStore();
  const { perms } = usePerms();
  const items = useNavItems();
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
      className={clsx(
        'fixed start-0 top-0 z-40 h-screen flex flex-col',
        'bg-surface border-e border-border-subtle',
        'transition-all duration-300 ease-out-expo',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border-subtle">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Shield className="text-cyan" size={24} />
            <span className="font-mono font-semibold text-cyan tracking-tight">
              ZM<span className="text-text-secondary">dash</span>
            </span>
          </div>
        )}
        {collapsed && <Shield className="text-cyan mx-auto" size={24} />}
      </div>

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}
        aria-expanded={!collapsed}
        className={clsx(
          'absolute -end-3 top-20 z-50',
          'w-6 h-6 rounded-full',
          'bg-panel border border-border',
          'flex items-center justify-center',
          'text-text-muted hover:text-text-primary',
          'transition-colors duration-fast',
          'hover:bg-elevated'
        )}
      >
        {collapsed
          ? <ChevronRight size={14} className="rtl:-scale-x-100" />
          : <ChevronLeft size={14} className="rtl:-scale-x-100" />}
      </button>

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
            'bg-panel/50'
          )}
        >
          <div className="w-8 h-8 rounded-full bg-cyan/20 flex items-center justify-center">
            <span className="text-cyan font-medium text-sm">
              {user?.user?.charAt(0).toUpperCase() || '?'}
            </span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {user?.user || t('Unknown')}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="p-1.5 rounded text-text-muted hover:text-crimson hover:bg-crimson/10 transition-colors"
            title={t('Log out')}
            aria-label={t('Log out')}
          >
            <LogOut size={16} className="rtl:-scale-x-100" />
          </button>
        </div>
      </div>
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
          ? 'bg-cyan/10 text-cyan'
          : 'text-text-secondary hover:text-text-primary hover:bg-panel'
      )}
    >
      {/* Active indicator */}
      {isActive && (
        <div className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-cyan rounded-e" />
      )}

      <span
        className={clsx(
          'flex-shrink-0',
          isActive ? 'text-cyan' : 'text-text-muted group-hover:text-text-secondary'
        )}
      >
        {item.icon}
      </span>

      {!collapsed && (
        <span className="font-medium text-sm">{item.label}</span>
      )}

      {!collapsed && item.badge !== undefined && item.badge > 0 && (
        <span className="ms-auto px-2 py-0.5 text-xs font-mono bg-crimson/20 text-crimson rounded">
          {item.badge}
        </span>
      )}

      {/* Tooltip for collapsed state */}
      {collapsed && (
        <div
          role="tooltip"
          className={clsx(
            'absolute start-full ms-2 px-2 py-1 rounded',
            'bg-elevated text-text-primary text-sm font-medium',
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
