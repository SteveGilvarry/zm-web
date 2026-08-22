import { Suspense, useEffect } from 'react';
import { resolvePage, useSkin } from './registry';
import type { PageKey, PagePropsMap, SkinId } from './types';

type SkinPageProps<K extends PageKey> = { page: K } & PagePropsMap[K];

/**
 * Render the active skin's page for `page`. Routes are thin wrappers:
 *
 *   export const Route = createFileRoute('/cycle/')({
 *     component: () => <SkinPage page="cycle" />,
 *   });
 *
 * Pages are lazy (one chunk per page per skin). When the active skin has no
 * page of its own the fallback skin's page is used, the wrapper is tagged
 * `data-skin-fallback="<from>"` and dev builds warn once per page.
 */
export function SkinPage<K extends PageKey>(props: SkinPageProps<K>) {
  const { page, ...pageProps } = props;
  const skin = useSkin();
  const { Page, ownPage, from } = resolvePage(skin, page);

  useEffect(() => {
    if (!ownPage && import.meta.env.DEV) warnFallbackOnce(skin.id, page, from);
  }, [ownPage, skin.id, page, from]);

  if (!Page) {
    throw new Error(`No skin implements page "${page}" (active skin: ${skin.id})`);
  }

  const content = (
    <Suspense fallback={null}>
      <Page {...(pageProps as unknown as PagePropsMap[K])} />
    </Suspense>
  );

  return ownPage ? content : <div data-skin-fallback={from}>{content}</div>;
}

const warned = new Set<string>();
function warnFallbackOnce(skinId: SkinId, page: PageKey, from: SkinId) {
  const id = `${skinId}:${page}`;
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(
    `[skins] "${skinId}" has no page "${page}"; rendering the "${from}" page instead. ` +
      `Add src/skins/${skinId}/pages/${page}.tsx to give it one.`,
  );
}
