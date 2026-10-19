import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { getEventFrameImageUrl } from '@/api/frames';

/**
 * One frame's JPEG, as legacy's frames list draws it (`ajax/frames.php:188`):
 * an `<img>` at `ZM_WEB_LIST_THUMB_WIDTH`, fetched by event and frame number
 * (ZoneMinder 1.39.36 dropped the `Frames.Id` legacy keyed on).
 *
 * The image route 404s whenever the event has no JPEGs on disk — every
 * event on an install that records video only. Legacy leaves a broken image
 * there; here the cell falls back to an em dash, so a table of them does not
 * read as a column of failures.
 *
 * With `animate` (`ZM_WEB_ANIMATE_THUMBS`), resting the pointer on it for a
 * quarter of a second shows the frame at full size over the table, as
 * legacy's `thumbnail_onmouseover` does for a still (`skin.js:1391`).
 */

/** Legacy waits a quarter of a second before the overlay (skin.js:1401). */
const HOVER_DELAY_MS = 250;
/** The overlay's width: the frame at most this wide, the thumbnail at least four times over. */
const OVERLAY_MAX_PX = 640;
export function FrameThumbnail({ eventId, frameNumber, token, width, className, animate = false }: {
  eventId: number;
  /** The frame's number within its event. */
  frameNumber: number;
  token?: string | null;
  width: number;
  className?: string;
  animate?: boolean;
}) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);

  if (failed) {
    return (
      <span className="text-fg-dim" title={t('No stored image for this frame.')}>&mdash;</span>
    );
  }

  const src = getEventFrameImageUrl(eventId, frameNumber, token);
  const thumb = (
    <img
      src={src}
      alt={t('Frame {{n}}', { n: frameNumber })}
      width={width}
      style={{ width }}
      loading="lazy"
      data-testid={`frame-thumb-${frameNumber}`}
      onError={() => setFailed(true)}
      className={clsx('inline-block h-auto max-w-none', className)}
    />
  );
  if (!animate) return thumb;

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => { cancel(); timer.current = setTimeout(() => setZoomed(true), HOVER_DELAY_MS); }}
      onMouseLeave={() => { cancel(); setZoomed(false); }}
    >
      {thumb}
      {zoomed && (
        <img
          src={src}
          alt=""
          aria-hidden
          data-testid={`frame-thumb-zoom-${frameNumber}`}
          style={{ width: Math.max(width * 4, Math.min(OVERLAY_MAX_PX, width * 8)) }}
          className="absolute top-0 end-full z-20 me-2 h-auto max-w-none border border-black/40 shadow-lg pointer-events-none"
        />
      )}
    </span>
  );
}
