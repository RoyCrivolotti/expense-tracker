/**
 * A hold can last a long while, and the new worker has already cleared the old build's files, so a screen opened in that
 * time can fail to load its chunk. That is the one case where waiting is worse than reloading, so it reloads, once per
 * build: the flag carries the build id, so a chunk that still fails after the reload does not loop, while the next deploy
 * gets its own go. Vite raises `vite:preloadError` for a failed dynamic import; Safari's own wording is caught from the
 * unhandled rejection. `reload` is the held reload, so a form that is open is left alone until it closes.
 */
const FLAG = 'chunk-reload-build'
const MESSAGE = /dynamically imported module|importing a module script failed|error loading dynamically imported/i

export function reloadOnChunkError(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
  buildId: string,
  reload: () => void,
): () => void {
  const fail = () => {
    try {
      // No storage means no loop guard, so no reload.
      if (!storage || storage.getItem(FLAG) === buildId) return
      storage.setItem(FLAG, buildId)
    } catch {
      return
    }
    reload()
  }
  const onPreload = (event: Event) => {
    event.preventDefault()
    fail()
  }
  const onRejection = (event: Event) => {
    const reason = (event as PromiseRejectionEvent).reason as { message?: unknown } | undefined
    if (typeof reason?.message === 'string' && MESSAGE.test(reason.message)) fail()
  }
  target.addEventListener('vite:preloadError', onPreload)
  target.addEventListener('unhandledrejection', onRejection)
  return () => {
    target.removeEventListener('vite:preloadError', onPreload)
    target.removeEventListener('unhandledrejection', onRejection)
  }
}
