/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching'
import type { PrecacheEntry } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkOnly } from 'workbox-strategies'
import { badgeOf, landingUrl, openReview, showPush } from './push'
import { SHELL_URL, isShellNavigation } from './shellNavigation'

/**
 * The app's service worker. `scripts/check-service-worker.mjs` runs the built file on every verify, and
 * `verify-offline-start.mjs` installs it in a browser, so what is asserted about it lives there.
 */
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry | string> }

// A new worker takes over at once, and the app's update prompt reloads the page.
void self.skipWaiting()
clientsClaim()

// The shell and the assets it names, from this build (the plugin fills in `__WB_MANIFEST`). An empty directory index
// (Workbox types it as a string, and any falsy value turns it off) keeps `/`, the URL the installed app launches at,
// from being answered by the precached shell before the network is asked (docs/decisions/service-worker-shell.md).
precacheAndRoute(self.__WB_MANIFEST, { directoryIndex: '' })
cleanupOutdatedCaches()

// Navigations go to the network, and the precached shell answers only when the network fails. Nothing else is
// answered: an API URL, an Access URL and the app's requests for its data are left to the browser.
registerRoute(
  isShellNavigation,
  new NetworkOnly({ plugins: [{ handlerDidError: () => matchPrecache(SHELL_URL) }] }),
  'GET',
)

// A push shows a notification whatever it holds, and puts the open count on the app icon where the device has a badge.
// The worker's globals are read inside the handler, so that evaluating the worker touches nothing a sandbox lacks.
self.addEventListener('push', (event) => {
  event.waitUntil(
    showPush(
      event.data?.text() ?? null,
      self.registration,
      badgeOf(self.navigator),
      self.navigator.language,
      self.clients,
    ),
  )
})

// A tap lands on the payment: an open window of the app is sent there, else one is opened.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(openReview(landingUrl(event.notification.data, self.registration.scope), self.clients))
})
