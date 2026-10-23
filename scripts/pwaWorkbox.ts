import type { VitePWAOptions } from 'vite-plugin-pwa'
import { isShellNavigation } from './pwaNavigation'

/** The page every route of the app is. It is precached with the assets it names, and is only ever the fallback. */
export const SHELL_URL = '/index.html'

/**
 * What the service worker is generated from. It exists so that the browser checks can build a worker from the same
 * options as the app.
 *
 * Navigations go to the network first, and the precached shell answers only when the network fails. The app is behind
 * Cloudflare Access, and the home-screen app on iOS has a cookie jar of its own, so a launch has to reach the network
 * for Access to ask for a sign-in. A shell that answered first would skip that. (Workbox only takes a timeout for
 * `NetworkFirst`, which keeps the pages it fetches in a cache of its own, ahead of the shell.)
 *
 * - `directoryIndex: null`: by default Workbox answers `/` from the precached `/index.html` before any other route
 *   sees it, which is the shell answering first, and `/` is the URL the app launches at.
 * - `navigateFallback: null`: the plugin adds a route that answers every navigation with the shell, for the same
 *   reason, and it throws when the worker is evaluated if the shell is not precached.
 * - The shell is precached with a revision, with the assets it names, so that whichever worker is installed holds a
 *   shell and the assets it asks for from the same build.
 */
export const workboxOptions: NonNullable<VitePWAOptions['workbox']> = {
  globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
  directoryIndex: null,
  navigateFallback: null,
  runtimeCaching: [
    {
      urlPattern: isShellNavigation,
      handler: 'NetworkOnly',
      options: { precacheFallback: { fallbackURL: SHELL_URL } },
    },
  ],
}
