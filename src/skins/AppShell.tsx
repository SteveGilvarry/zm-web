import type { ReactNode } from 'react';
import { useSkin } from './registry';
import { useSkinRootClass } from './useSkinRootClass';

interface AppShellProps {
  title?: string;
  children: ReactNode;
}

/**
 * Wraps page content in the active skin's shell and binds the skin's design
 * tokens by putting its `rootClass` on <html>.
 *
 * Pages are skin-specific components (see `SkinPage`); the shell is the
 * chrome around them. Both come from the same `SkinDefinition`.
 */
export function AppShell({ title, children }: AppShellProps) {
  const skin = useSkin();
  useSkinRootClass(skin.rootClass);
  const Shell = skin.Shell;
  return <Shell title={title}>{children}</Shell>;
}
