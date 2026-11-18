/** The page every route of the app is. It is precached with the assets it names, and is only ever the fallback. */
export const SHELL_URL = '/index.html'

/**
 * Which navigations the service worker answers: the app's own pages, with the network first and the precached shell
 * when the network fails (`sw.ts`).
 *
 * A page is a navigation, and so is an API URL opened in a tab (a receipt, an export), and the Access endpoints are
 * navigations too. Those are left to the browser: an offline receipt is an error and not the shell, and Access must
 * answer for itself.
 */
export const isShellNavigation = ({ request, url }: { request: { mode: string }; url: { pathname: string } }): boolean =>
  request.mode === 'navigate' && !/^\/(api|cdn-cgi)\//.test(url.pathname)
