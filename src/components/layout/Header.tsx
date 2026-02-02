import { Bell, Search, Activity, Wifi, WifiOff } from 'lucide-react';
import { clsx } from 'clsx';
import { useEffect, useState } from 'react';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Simple connectivity check
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch('/api/v3/health', { method: 'GET' });
        setIsConnected(response.ok);
      } catch {
        setIsConnected(false);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-14 bg-surface/80 backdrop-blur-sm border-b border-border-subtle flex items-center justify-between px-6">
      {/* Left: Title */}
      <div className="flex items-center gap-4">
        {title && (
          <h1 className="text-lg font-semibold text-text-primary">{title}</h1>
        )}
      </div>

      {/* Center: Search (optional) */}
      <div className="flex-1 max-w-md mx-8">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            size={16}
          />
          <input
            type="text"
            placeholder="Search monitors, events..."
            className={clsx(
              'w-full pl-10 pr-4 py-2 rounded-lg',
              'bg-panel border border-border-subtle',
              'text-text-primary placeholder:text-text-muted',
              'focus:outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/20',
              'transition-all duration-fast'
            )}
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono text-text-dim bg-abyss rounded">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right: Status + Time + Notifications */}
      <div className="flex items-center gap-4">
        {/* Connection status */}
        <div
          className={clsx(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg',
            isConnected ? 'bg-emerald/10' : 'bg-crimson/10'
          )}
        >
          {isConnected ? (
            <>
              <Wifi className="text-emerald" size={14} />
              <span className="text-xs font-medium text-emerald">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="text-crimson" size={14} />
              <span className="text-xs font-medium text-crimson">Disconnected</span>
            </>
          )}
        </div>

        {/* System activity indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-panel">
          <Activity className="text-cyan animate-pulse" size={14} />
          <span className="text-xs font-mono text-text-secondary">SYSTEM OK</span>
        </div>

        {/* Time display */}
        <div className="flex flex-col items-end">
          <span className="text-sm font-mono text-text-primary tabular-nums">
            {currentTime.toLocaleTimeString('en-US', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
          <span className="text-[10px] font-mono text-text-muted">
            {currentTime.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>

        {/* Notifications */}
        <button
          className={clsx(
            'relative p-2 rounded-lg',
            'text-text-muted hover:text-text-primary',
            'hover:bg-panel transition-colors'
          )}
        >
          <Bell size={20} />
          {/* Notification badge */}
          <span className="absolute top-1 right-1 w-2 h-2 bg-crimson rounded-full animate-pulse-live" />
        </button>
      </div>
    </header>
  );
}
