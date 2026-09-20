import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getEventStreamUrl, getEventThumbnailUrl } from '@/api/events';

/** Legacy waits a quarter of a second before animating (skin.js:1414). */
const HOVER_DELAY_MS = 250;

/**
 * An events-list thumbnail that plays the event on hover, the way
 * `initThumbAnimation` / `thumbnail_onmouseover` do in ZoneMinder 1.39
 * (`skin.js:1404-1432`), gated on the same `ZM_WEB_ANIMATE_THUMBS` option.
 *
 * Legacy picks the best source it can reach — a live stream, the event's HLS
 * playlist, then its MP4. zm-api exposes the last of those
 * (`/events/{id}/stream/video.mp4`), so that is what plays; if it is not
 * there the still image stays, which is also what an event with no saved
 * video looks like in legacy.
 */
export function EventThumbnail({ eventId, token, width, animate = false }: {
  eventId: number;
  token?: string | null;
  width: number;
  animate?: boolean;
}) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);

  const hoverProps = animate
    ? {
      onMouseEnter: () => {
        cancel();
        timer.current = setTimeout(() => setPlaying(true), HOVER_DELAY_MS);
      },
      onMouseLeave: () => { cancel(); setPlaying(false); },
    }
    : {};

  if (playing) {
    return (
      <video
        src={getEventStreamUrl(eventId, token ?? undefined)}
        width={width}
        style={{ width }}
        className="inline-block h-auto max-w-none"
        autoPlay
        muted
        loop
        playsInline
        data-testid={`event-thumb-video-${eventId}`}
        aria-label={t('Preview of event {{id}}', { id: eventId })}
        onError={() => setPlaying(false)}
        {...hoverProps}
      />
    );
  }

  return (
    <img
      src={getEventThumbnailUrl(eventId, token ?? undefined)}
      alt={t('Thumbnail for event {{id}}', { id: eventId })}
      width={width}
      style={{ width }}
      className="inline-block h-auto max-w-none"
      loading="lazy"
      onError={(ev) => { ev.currentTarget.style.visibility = 'hidden'; }}
      {...hoverProps}
    />
  );
}
