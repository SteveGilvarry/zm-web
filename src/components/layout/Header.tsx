import { Wifi, WifiOff } from 'lucide-react';
import { clsx } from 'clsx';
import { useEffect, useState } from 'react';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Connectivity check against the API health endpoint
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch('/api/v3/server/health_check', { method: 'GET' });
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

      {/* Right: Connection status + Time */}
      <div className="flex items-center gap-4">
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
      </div>
    </header>
  );
}
