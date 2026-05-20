import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { useUiStore } from '@/stores/ui';

interface ModernShellProps {
  title?: string;
  children: ReactNode;
}

/**
 * Mission Control shell — left sidebar nav, top header strip with connection
 * pill + clock, scanlined cyan accents. Wraps page content.
 */
export function ModernShell({ title, children }: ModernShellProps) {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  return (
    <div className="min-h-screen bg-void">
      <Sidebar />
      <div
        className={clsx(
          'min-h-screen flex flex-col transition-all duration-300 ease-out',
          sidebarCollapsed ? 'ml-16' : 'ml-56',
        )}
      >
        <Header title={title} />
        {children}
      </div>
      {/* Background grid */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute inset-0 bg-grid opacity-20" />
      </div>
    </div>
  );
}
