import { describe, expect, it, vi } from 'vitest'
import { reloadOnChunkError } from './reloadOnChunkError'

function memory() {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

function setup(buildId = 'abc123', storage: ReturnType<typeof memory> | undefined = memory()) {
  const target = new EventTarget() as unknown as Window
  const reload = vi.fn()
  const stop = reloadOnChunkError(target, storage, buildId, reload)
  return { target, reload, storage, stop }
}

const preloadError = () => new Event('vite:preloadError', { cancelable: true })
function rejection(message: string) {
  return Object.assign(new Event('unhandledrejection'), { reason: new Error(message) })
}

describe('reloadOnChunkError', () => {
  it('reloads when a chunk fails to load', () => {
    const { target, reload } = setup()
    target.dispatchEvent(preloadError())
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads only once for a build, so a chunk that still fails does not loop', () => {
    const { target, reload } = setup()
    target.dispatchEvent(preloadError())
    target.dispatchEvent(preloadError())
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('gives the next build its own reload', () => {
    const storage = memory()
    const first = setup('one', storage)
    first.target.dispatchEvent(preloadError())
    const second = setup('two', storage)
    second.target.dispatchEvent(preloadError())
    expect(second.reload).toHaveBeenCalledTimes(1)
  })

  it('catches the wording of a failed dynamic import that arrives as an unhandled rejection', () => {
    const { target, reload } = setup()
    target.dispatchEvent(rejection('Importing a module script failed.'))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('ignores other rejections, does not reload without storage to guard it, and stops when told', () => {
    const { target, reload, stop } = setup()
    target.dispatchEvent(rejection('Network request failed'))
    expect(reload).not.toHaveBeenCalled()

    const bare = new EventTarget() as unknown as Window
    const bareReload = vi.fn()
    reloadOnChunkError(bare, undefined, 'x', bareReload)
    bare.dispatchEvent(preloadError())
    expect(bareReload).not.toHaveBeenCalled()

    stop()
    target.dispatchEvent(preloadError())
    expect(reload).not.toHaveBeenCalled()
  })
})
