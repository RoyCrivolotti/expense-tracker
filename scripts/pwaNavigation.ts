/**
 * Which navigations the service worker may keep a copy of. Workbox writes `isShellNavigation` into the generated
 * worker as text, so it can use nothing outside its own body.
 *
 * A page is a navigation, and so is an API URL opened in a tab (a receipt, an export): a worker that answers a
 * navigation from its copy when the network is slow or down would serve one person's data to whoever asks for the
 * same URL next on that browser, so the API and the Access endpoints are left to the network. This is a guard and
 * not a repair: `/index.html` is not precached, so the worker as built throws while it registers its navigation
 * route (`createHandlerBoundToURL`), before this rule is registered, and keeps no navigation either way.
 */
export const isShellNavigation = ({ request, url }: { request: { mode: string }; url: { pathname: string } }): boolean =>
  request.mode === 'navigate' && !/^\/(api|cdn-cgi)\//.test(url.pathname)

/** The same two prefixes, for the fallback to the shell that Workbox adds for a navigation it has no copy of. */
export const NAVIGATION_DENYLIST = [/^\/api\//, /^\/cdn-cgi\//]
