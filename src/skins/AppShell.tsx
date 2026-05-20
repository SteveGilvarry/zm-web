import type { ReactNode } from 'react';
import { useUiStore } from '@/stores/ui';
import { ModernShell } from './modern/Shell';
import { ClassicShell } from './classic/Shell';

interface AppShellProps {
  title?: string;
  children: ReactNode;
}

/**
 * Selects the visual shell — Mission Control (modern) or Classic ZM — based
 * on the persisted user preference in `useUiStore.skin`.
 *
 * Routes wrap their main content in <AppShell title="…">. The data layer and
 * inner page components are skin-agnostic; only the surrounding chrome
 * (sidebar / topnav / stat strip / theme tokens) differs between skins.
 */
export function AppShell({ title, children }: AppShellProps) {
  const skin = useUiStore((s) => s.skin);
  const Shell = skin === 'classic' ? ClassicShell : ModernShell;
  return <Shell title={title}>{children}</Shell>;
}
