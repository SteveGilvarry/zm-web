import { useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { getEventFrameImageUrl, type EventFrameRef } from '@/api/frames';
import { useZmConfig } from '@/features/config/useZmConfig';
import { useAuthStore } from '@/stores/auth';

/**
 * The two stills legacy puts under the event stats table (`event.php:313-334`):
 * the first alarmed frame and the frame with the most motion. ZoneMinder names
 * them itself, so the client passes `fid=alarm` / `fid=snapshot` straight
 * through rather than picking a frame.
 *
 * Legacy tests for the file on disk before drawing the `<img>`; over HTTP the
 * equivalent is letting the request 404 and dropping the figure, which is what
 * happens for every event on an install that records video only, and for
 * `alarm` on any event with no alarm frame. When neither loads the block
 * renders nothing at all.
 *
 * The third still, `objdetect`, is deliberately left out.
 */
const KEY_FRAMES: ReadonlyArray<{ fid: Extract<EventFrameRef, string>; }> = [
  { fid: 'alarm' },
  { fid: 'snapshot' },
];

export function EventKeyFrames({ eventId, className }: { eventId: number; className?: string }) {
  const { t } = useTranslation();
  const { accessToken } = useAuthStore();
  const configWidth = useZmConfig('ZM_WEB_LIST_THUMB_WIDTH', 48);
  const width = configWidth > 0 ? configWidth : 48;
  const [failed, setFailed] = useState<string[]>([]);

  const shown = KEY_FRAMES.filter((f) => !failed.includes(f.fid));
  if (shown.length === 0) return null;

  const label = (fid: string) =>
    fid === 'alarm' ? t('First alarmed frame') : t('Frame with the most motion');

  return (
    <div className={clsx('flex flex-wrap gap-2', className)} data-testid="event-key-frames">
      {shown.map(({ fid }) => (
        <a
          key={fid}
          href={getEventFrameImageUrl(eventId, fid, accessToken)}
          target="_blank"
          rel="noreferrer"
          title={label(fid)}
        >
          <img
            src={getEventFrameImageUrl(eventId, fid, accessToken)}
            alt={label(fid)}
            width={width}
            style={{ width }}
            loading="lazy"
            data-testid={`event-frame-${fid}`}
            onError={() => setFailed((prev) => (prev.includes(fid) ? prev : [...prev, fid]))}
            className="block h-auto max-w-none rounded-sm"
          />
        </a>
      ))}
    </div>
  );
}
