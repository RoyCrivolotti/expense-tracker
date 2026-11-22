import { describe, expect, it, vi } from 'vitest'
import { reloadWhenWorkerReplaced } from './reloadWhenWorkerReplaced'

/** A service worker container that is an event target with, or without, a controller. */
function container(controlled: boolean) {
  const target = new EventTarget()
  return Object.assign(target, {
    controller: controlled ? ({} as ServiceWorker) : null,
  }) as unknown as ServiceWorkerContainer & EventTarget
}

describe('reloadWhenWorkerReplaced', () => {
  it('reloads when a new worker takes over a page that was opened under another', () => {
    const sw = container(true)
    const reload = vi.fn()
    reloadWhenWorkerReplaced(sw, reload)

    sw.dispatchEvent(new Event('controllerchange'))

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads once however many times the controller changes', () => {
    const sw = container(true)
    const reload = vi.fn()
    reloadWhenWorkerReplaced(sw, reload)

    sw.dispatchEvent(new Event('controllerchange'))
    sw.dispatchEvent(new Event('controllerchange'))

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('leaves the first install alone: a page with no controller is claimed, not replaced', () => {
    const sw = container(false)
    const reload = vi.fn()
    reloadWhenWorkerReplaced(sw, reload)

    sw.dispatchEvent(new Event('controllerchange'))

    expect(reload).not.toHaveBeenCalled()
  })

  it('stops listening when told to, and does nothing where there are no service workers', () => {
    const sw = container(true)
    const reload = vi.fn()
    reloadWhenWorkerReplaced(sw, reload)()
    sw.dispatchEvent(new Event('controllerchange'))
    expect(reload).not.toHaveBeenCalled()

    expect(() => reloadWhenWorkerReplaced(undefined, reload)()).not.toThrow()
  })
})
