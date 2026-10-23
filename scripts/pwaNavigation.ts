/**
 * Which navigations the service worker answers: the app's own pages, with the network first and the precached shell
 * when the network fails (`pwaWorkbox.ts`). Workbox writes `isShellNavigation` into the generated worker as text, so
 * it can use nothing outside its own body.
 *
 * A page is a navigation, and so is an API URL opened in a tab (a receipt, an export), and the Access endpoints are
 * navigations too. Those are left to the browser: an offline receipt is an error and not the shell, and Access must
 * answer for itself.
 */
export const isShellNavigation = ({ request, url }: { request: { mode: string }; url: { pathname: string } }): boolean =>
  request.mode === 'navigate' && !/^\/(api|cdn-cgi)\//.test(url.pathname)
