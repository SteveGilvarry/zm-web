import type { ReactNode } from 'react';
import { ClassicTopNav } from './shell/TopNav';
import { ClassicStatBar } from './shell/StatBar';
import { BackendBanner } from '@/components/common/BackendBanner';
import { ToastViewport } from '@/components/common/ToastViewport';

interface ClassicShellProps {
  title?: string;
  children: ReactNode;
}

/**
 * Classic ZoneMinder shell — top nav bar, sub-header stat strip, light
 * content area with table-heavy layouts. Mirrors the legacy PHP UI for
 * operators migrating from the old interface.
 */
export function ClassicShell({ children }: ClassicShellProps) {
  return (
    <div className="skin-classic classic-theme min-h-screen bg-zinc-100 text-zinc-900">
      <ClassicTopNav />
      <ClassicStatBar />
      <BackendBanner />
      {children}
      <ToastViewport />
    </div>
  );
}
