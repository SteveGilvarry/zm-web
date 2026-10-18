import { useZmConfig } from '@/features/config/useZmConfig';

/**
 * Legacy `getConsoleBannerHTML`: `ZM_WEB_CONSOLE_BANNER` as a centred `<h2>`
 * in its own navbar under the stat strip, on every page. Nothing at all
 * when the option is empty.
 */
export function ClassicConsoleBanner() {
  const banner = useZmConfig('ZM_WEB_CONSOLE_BANNER', '');
  if (banner.trim() === '') return null;
  return (
    // Legacy wraps it in a `<nav>`, but it holds no links, so a plain block.
    <div id="navbar-three" className="flex justify-center px-4 py-2 bg-classic-nav text-classic-nav-fg">
      <h2 className="text-2xl font-medium">{banner}</h2>
    </div>
  );
}
