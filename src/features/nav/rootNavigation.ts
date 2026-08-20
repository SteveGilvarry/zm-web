import { isSkinId } from '@/skins/registry';
import type { SkinId } from '@/skins/types';
import { redirectParamFor } from '@/features/auth/redirect';
import { mapLegacyUrl, targetHref } from './legacyUrl';

export interface RootNavInput {
  pathname: string;
  /** Raw search string, with or without the leading `?`. */
  searchString: string;
  isAuthenticated: boolean;
  /** The session was dropped by a failed refresh → `/login?reason=expired`. */
  sessionExpired?: boolean;
}

export interface RootNavPlan {
  /** Skin requested via `?skin=`; apply before redirecting. */
  skin?: SkinId;
  /** Where to go instead of rendering this location, if anywhere. */
  href?: string;
}

/**
 * Everything the root route decides before a page renders, as a pure
 * function so it can be tested without a router:
 *
 *  1. `?skin=` is read and stripped.
 *  2. Legacy `index.php?view=…` URLs are rewritten to dashboard routes.
 *  3. Anything but `/login` needs a session; otherwise bounce to
 *     `/login?redirect=<where you were going>`.
 *
 * `?lang=` is left in place: i18next's detector already read it at start-up.
 */
export function planRootNavigation(input: RootNavInput): RootNavPlan {
  const plan: RootNavPlan = {};
  const params = new URLSearchParams(
    input.searchString.startsWith('?') ? input.searchString.slice(1) : input.searchString,
  );

  const requestedSkin = params.get('skin');
  let stripped = false;
  if (requestedSkin != null) {
    if (isSkinId(requestedSkin)) plan.skin = requestedSkin;
    params.delete('skin');
    stripped = true;
  }

  let pathname = input.pathname;
  let search = params.toString();
  let changed = stripped;

  const legacy = mapLegacyUrl(pathname, search);
  if (legacy) {
    const href = targetHref(legacy);
    const q = href.indexOf('?');
    pathname = q === -1 ? href : href.slice(0, q);
    search = q === -1 ? '' : href.slice(q + 1);
    changed = true;
  }

  if (!input.isAuthenticated && pathname !== '/login') {
    const redirect = redirectParamFor(pathname, search);
    const qs = new URLSearchParams();
    if (redirect) qs.set('redirect', redirect);
    if (input.sessionExpired) qs.set('reason', 'expired');
    const s = qs.toString();
    plan.href = `/login${s ? `?${s}` : ''}`;
    return plan;
  }

  if (changed) plan.href = `${pathname}${search ? `?${search}` : ''}`;
  return plan;
}
