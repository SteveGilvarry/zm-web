import { useEffect } from 'react';
import { clsx } from 'clsx';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useWebRtcStream } from '@/hooks/useWebRtcStream';
import { useHlsStream } from '@/hooks/useHlsStream';
import type { StreamProtocol } from '@/types';
import type { StreamHookResult } from '@/hooks/useWebRtcStream';

interface StreamCellProps {
  protocol: StreamProtocol;
  monitorId: number;
  monitorName?: string;
  autoStart?: boolean;
  compact?: boolean;
  showControls?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export function StreamCell({
  protocol,
  monitorId,
  monitorName,
  autoStart = false,
  compact = false,
  showControls = false,
  onClick,
  onDoubleClick,
}: StreamCellProps) {
  // Conditionally render inner component based on protocol.
  // When protocol changes, React unmounts the old and mounts the new,
  // triggering hook cleanup (closing connections).
  if (protocol === 'webrtc') {
    return (
      <WebRtcStreamInner
        monitorId={monitorId}
        monitorName={monitorName}
        autoStart={autoStart}
        compact={compact}
        showControls={showControls}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />
    );
  }
  return (
    <HlsStreamInner
      monitorId={monitorId}
      monitorName={monitorName}
      autoStart={autoStart}
      compact={compact}
      showControls={showControls}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    />
  );
}

interface StreamInnerProps {
  monitorId: number;
  monitorName?: string;
  autoStart: boolean;
  compact: boolean;
  showControls: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

function WebRtcStreamInner(props: StreamInnerProps) {
  const stream = useWebRtcStream(props.monitorId);
  return <StreamVideo stream={stream} protocol="webrtc" {...props} />;
}

function HlsStreamInner(props: StreamInnerProps) {
  const stream = useHlsStream(props.monitorId);
  return <StreamVideo stream={stream} protocol="hls" {...props} />;
}

interface StreamVideoProps extends StreamInnerProps {
  stream: StreamHookResult;
  protocol: StreamProtocol;
}

function StreamVideo({
  stream,
  protocol,
  monitorName,
  autoStart,
  compact,
  showControls,
  onClick,
  onDoubleClick,
}: StreamVideoProps) {
  const isConnecting = stream.state === 'connecting' || stream.state === 'signaling';
  const isConnected = stream.state === 'connected';
  const isFailed = stream.state === 'failed';
  const isIdle = stream.state === 'idle';

  useEffect(() => {
    if (autoStart && isIdle) {
      stream.start();
    }
  }, [autoStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    stream.stop();
    setTimeout(() => stream.start(), 200);
  };

  return (
    <div
      className="relative w-full h-full bg-abyss overflow-hidden"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {/* Video element — always rendered so ref is available */}
      <video
        ref={stream.videoRef}
        className={clsx(
          'w-full h-full object-contain bg-black',
          isIdle && 'hidden',
        )}
        autoPlay
        muted
        playsInline
      />

      {/* Idle state */}
      {isIdle && !autoStart && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-text-dim text-xs font-mono">OFFLINE</div>
        </div>
      )}

      {/* Connecting overlay */}
      {isConnecting && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="text-center">
            <Loader2
              size={compact ? 20 : 32}
              className="mx-auto text-cyan animate-spin"
            />
            {!compact && (
              <p className="text-xs text-text-muted mt-2">
                {stream.state === 'signaling' ? 'Negotiating...' : 'Connecting...'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Failed overlay */}
      {isFailed && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="text-center">
            <AlertTriangle size={compact ? 16 : 24} className="mx-auto text-amber mb-1" />
            {!compact && (
              <p className="text-xs text-text-muted mb-2 max-w-[200px] mx-auto">
                {stream.error || 'Stream failed'}
              </p>
            )}
            <button
              onClick={handleRetry}
              className={clsx(
                'flex items-center gap-1 mx-auto rounded',
                'text-xs font-medium text-cyan hover:text-cyan-dim transition-colors',
                compact ? 'px-2 py-1' : 'px-3 py-1.5 bg-surface/50',
              )}
            >
              <RefreshCw size={12} />
              Retry
            </button>
          </div>
        </div>
      )}

      {/* LIVE badge */}
      {isConnected && (
        <div
          className={clsx(
            'absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60',
            compact && 'top-1 left-1',
          )}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-crimson opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-crimson" />
          </span>
          <span className="text-[10px] font-mono font-bold text-white">
            LIVE
          </span>
          {!compact && (
            <span className="text-[10px] font-mono text-text-muted">
              &middot; {protocol === 'webrtc' ? 'WebRTC' : 'HLS'}
            </span>
          )}
        </div>
      )}

      {/* Monitor name overlay */}
      {monitorName && !compact && (
        <div className="absolute inset-x-0 bottom-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent">
          <span className="text-xs font-medium text-white truncate block">
            {monitorName}
          </span>
        </div>
      )}

      {/* Controls overlay */}
      {showControls && isConnected && (
        <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              stream.stop();
            }}
            className="p-1 rounded bg-black/60 text-text-muted hover:text-crimson transition-colors"
          >
            <span className="text-[10px] font-mono font-bold">STOP</span>
          </button>
        </div>
      )}

      {/* Non-fatal error toast */}
      {stream.error && !isFailed && (
        <div className="absolute top-1.5 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber/90 text-void text-[10px] font-medium">
            <AlertTriangle size={10} />
            {stream.error}
          </div>
        </div>
      )}

      {/* Scanlines */}
      <div className="absolute inset-0 scanlines pointer-events-none" />
    </div>
  );
}
