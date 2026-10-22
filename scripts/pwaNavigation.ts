/**
 * Which navigations the service worker may keep a copy of. Workbox writes `isShellNavigation` into the generated
 * worker as text, so it can use nothing outside its own body.
 *
 * A page is a navigation, and so is an API URL opened in a tab (a receipt, an export): the worker answers a
 * navigation from its copy when the network is slow or down, and the copy would be one person's data served to
 * whoever asks for the same URL next on that browser. The API and the Access endpoints are left to the network.
 */
export const isShellNavigation = ({ request, url }: { request: { mode: string }; url: { pathname: string } }): boolean =>
  request.mode === 'navigate' && !/^\/(api|cdn-cgi)\//.test(url.pathname)

/** The same two prefixes, for the fallback to the shell that Workbox adds for a navigation it has no copy of. */
export const NAVIGATION_DENYLIST = [/^\/api\//, /^\/cdn-cgi\//]
