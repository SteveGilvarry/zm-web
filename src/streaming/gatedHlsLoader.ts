/**
 * hls.js fetches playlists and segments with its own loader, outside the API
 * client's 429 gate (`src/api/client.ts`). On a montage that is most of the
 * traffic: four cells polling playlists and pulling segments through a
 * penalty is exactly what makes zm-api's limiter extend it, and the gate
 * never heard about any of it.
 *
 * This wraps hls.js's own loader so every load first waits out whatever
 * penalty the client already knows about, and a 429 the loader sees itself
 * closes that gate for everyone, `Retry-After` included. It changes when
 * requests go out, not what hls.js does with the answers.
 */
import type { HlsConfig, Loader, LoaderCallbacks, LoaderConfiguration, LoaderContext } from 'hls.js';
import { noteRateLimited, parseRetryAfter, reserveRateLimitSlot } from '@/api/client';

type LoaderClass = new (config: HlsConfig) => Loader<LoaderContext>;

export function gatedLoader(Base: LoaderClass): LoaderClass {
  return class GatedLoader extends Base {
    gateTimer: ReturnType<typeof setTimeout> | null = null;

    load(context: LoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>): void {
      const onError: LoaderCallbacks<LoaderContext>['onError'] = (response, ctx, networkDetails, stats) => {
        if (response.code === 429) {
          const xhr = networkDetails as { getResponseHeader?: (h: string) => string | null } | null;
          noteRateLimited(parseRetryAfter(xhr?.getResponseHeader?.('retry-after') ?? null));
        }
        callbacks.onError(response, ctx, networkDetails, stats);
      };
      const go = () => {
        this.gateTimer = null;
        super.load(context, config, { ...callbacks, onError });
      };
      const delay = reserveRateLimitSlot();
      if (delay > 0) this.gateTimer = setTimeout(go, delay);
      else go();
    }

    abort(): void {
      this.clearGate();
      super.abort();
    }

    destroy(): void {
      this.clearGate();
      super.destroy();
    }

    clearGate(): void {
      if (this.gateTimer) {
        clearTimeout(this.gateTimer);
        this.gateTimer = null;
      }
    }
  };
}
