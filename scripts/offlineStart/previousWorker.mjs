/**
 * The service worker the app shipped before the shell was precached, rebuilt from the options it was built with, so
 * that the update from it can be tried. Its defect is the reason for the change: it precaches no `index.html`, and
 * `createHandlerBoundToURL('/index.html')` throws while it is evaluated, so it answers no navigation.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { generateSW } from 'workbox-build'

export const PREVIOUS_OPTIONS = {
  globPatterns: ['**/*.{js,css,svg,png,ico,webmanifest,woff2}'],
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [/^\/api\//, /^\/cdn-cgi\//],
  runtimeCaching: [
    {
      urlPattern: ({ request, url }) => request.mode === 'navigate' && !/^\/(api|cdn-cgi)\//.test(url.pathname),
      handler: 'NetworkFirst',
      options: { cacheName: 'app-shell', networkTimeoutSeconds: 5, expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 } },
    },
  ],
  // What the PWA plugin adds for `registerType: 'autoUpdate'`.
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
}

/** A small stand-in for an earlier build of the app, with that worker, written into `dir`. */
export async function buildPreviousSite(dir) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'assets'), { recursive: true })
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><title>Previous build</title><div id="root">previous build</div><script src="/assets/app-previous.js"></script>',
  )
  writeFileSync(join(dir, 'assets', 'app-previous.js'), "navigator.serviceWorker.register('/sw.js')")
  writeFileSync(join(dir, 'assets', 'vendor-previous.js'), 'globalThis.previousVendor = true')
  await generateSW({ ...PREVIOUS_OPTIONS, globDirectory: dir, swDest: join(dir, 'sw.js'), sourcemap: false })
  return dir
}
