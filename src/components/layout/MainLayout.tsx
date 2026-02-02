import { Outlet } from '@tanstack/react-router';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface MainLayoutProps {
  title?: string;
}

export function MainLayout({ title }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-void">
      <Sidebar />

      {/* Main content area with left margin for sidebar */}
      <div className="ml-56 min-h-screen flex flex-col">
        <Header title={title} />

        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        {/* Subtle grid */}
        <div className="absolute inset-0 bg-grid opacity-30" />

        {/* Corner vignette */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at top left, transparent 0%, var(--color-void) 70%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at bottom right, transparent 0%, var(--color-void) 70%)',
          }}
        />
      </div>
    </div>
  );
}
