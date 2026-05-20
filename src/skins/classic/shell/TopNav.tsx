import { Link, useLocation } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useAuthStore } from '@/stores/auth';

// Mirrors the legacy ZoneMinder top navigation. Items map to either existing
// routes or future ones (some 404 until later phases land them).
const NAV_ITEMS: Array<{ icon: string; label: string; to: string }> = [
  { icon: 'dashboard', label: 'Console', to: '/' },
  { icon: 'menu', label: 'Cycle', to: '/cycle' },
  { icon: 'live_tv', label: 'Montage', to: '/montage' },
  { icon: 'movie', label: 'Montage Review', to: '/montagereview' },
  { icon: 'event', label: 'Events', to: '/events' },
  { icon: 'settings', label: 'Options', to: '/settings' },
  { icon: 'notification_important', label: 'Log', to: '/logs' },
  { icon: 'group', label: 'Groups', to: '/groups' },
  { icon: 'filter_alt', label: 'Filters', to: '/filters' },
  { icon: 'report', label: 'Reports', to: '/reports' },
  { icon: 'shield', label: 'Audit', to: '/audit' },
];

export function ClassicTopNav() {
  const location = useLocation();
  const { user, clearAuth } = useAuthStore();

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  return (
    <header className="bg-[#3c4956] text-white border-b border-black/40 sticky top-0 z-30">
      <div className="px-4 py-2 flex items-center gap-6 flex-wrap">
        <div className="text-2xl font-semibold tracking-tight text-amber-400">
          ZoneMinder
        </div>
        <nav className="flex-1">
          <ul className="flex items-center gap-1 flex-wrap">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={clsx(
                    'flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-colors',
                    'hover:bg-white/10',
                    isActive(item.to) && 'bg-white/15 text-cyan-300',
                    !isActive(item.to) && 'text-cyan-200',
                  )}
                >
                  <span aria-hidden className="text-base leading-none">
                    {symbol(item.icon)}
                  </span>
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-3 text-sm">
          {user?.user && (
            <button
              type="button"
              onClick={clearAuth}
              className="flex items-center gap-1 hover:underline"
              title="Logout"
            >
              <span aria-hidden>👤</span>
              <span>{user.user}</span>
            </button>
          )}
          <span className="px-2 py-1 bg-zinc-600 rounded text-xs font-mono">
            RUNNING
          </span>
        </div>
      </div>
    </header>
  );
}

// Tiny unicode placeholder for Material Icons until Phase 8 wires in the
// real icon font (legacy ZM uses Material Icons).
function symbol(name: string): string {
  switch (name) {
    case 'dashboard': return '▦';
    case 'menu': return '☰';
    case 'live_tv': return '▶';
    case 'movie': return '🎬';
    case 'event': return '📅';
    case 'settings': return '⚙';
    case 'notification_important': return '🔔';
    case 'group': return '👥';
    case 'filter_alt': return '⛛';
    case 'report': return '📊';
    case 'shield': return '🛡';
    default: return '•';
  }
}
