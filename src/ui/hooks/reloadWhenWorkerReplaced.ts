/**
 * Reloads the page once a new service worker takes it over from the one it was opened under.
 *
 * `registerType: 'autoUpdate'` already reloads on the worker's `activated` event, but Workbox only hears of an update
 * that starts after `register()` has resolved. A launch starts the browser's own update check, so when that finds a new
 * worker first (the install is under way, or finished, before the page's registration comes back) the page never hears
 * of it and keeps running the old build under a worker that has already cleared that build's files. The worker takes over
 * with `skipWaiting` and `clients.claim`, so `controllerchange` is the one signal that cannot be missed this way.
 *
 * A page with no controller yet is the first install, which also fires `controllerchange` when it claims the page and
 * has nothing to replace, so it is left alone. Returns a function that stops listening.
 */
export function reloadWhenWorkerReplaced(
  container: ServiceWorkerContainer | undefined,
  reload: () => void,
): () => void {
  if (!container?.controller) return () => undefined
  let reloaded = false
  const onChange = () => {
    if (reloaded) return
    reloaded = true
    reload()
  }
  container.addEventListener('controllerchange', onChange)
  return () => container.removeEventListener('controllerchange', onChange)
}
