import { useState, type ReactNode } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { useUiStore } from '@/stores/ui';
import { BackendBanner } from '@/components/common/BackendBanner';
import { ToastViewport } from '@/components/common/ToastViewport';

interface ModernShellProps {
  title?: string;
  children: ReactNode;
}

/**
 * The modern shell — sidebar nav, a thin header, and a content column that
 * is exactly one viewport tall.
 *
 * The frame is fixed and the page scrolls inside it, which is what an ops
 * console needs: a camera wall that ends below the fold is not a wall, and
 * a table's query line and pager should stay put while its rows move. Pages
 * put `overflow-auto` on the region that scrolls.
 *
 * Below `lg` the sidebar is an off-canvas drawer opened from the header's
 * menu button; it closes on navigation, Escape, or a backdrop tap, and the
 * content column stops reserving space for it.
 */
export function ModernShell({ title, children }: ModernShellProps) {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // The drawer remembers the path it was opened on, so navigating away
  // closes it without an effect.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const navOpen = openedAt === pathname;
  const setNavOpen = (open: boolean) => setOpenedAt(open ? pathname : null);

  return (
    <div className="h-screen overflow-hidden bg-bg">
      <Sidebar mobileOpen={navOpen} onMobileClose={() => setNavOpen(false)} />
      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden
        />
      )}
      <div
        className={clsx(
          'h-screen flex flex-col min-w-0 min-h-0 transition-all duration-300 ease-out',
          sidebarCollapsed ? 'lg:ms-16' : 'lg:ms-56',
        )}
      >
        <Header title={title} onMenu={() => setNavOpen(true)} menuOpen={navOpen} />
        <BackendBanner />
        {children}
      </div>
      <ToastViewport />
    </div>
  );
}
