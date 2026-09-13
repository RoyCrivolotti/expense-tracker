import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom implements neither, and anything that previews a File (the receipts
// strip) or downloads a Blob (the CSV exports) reaches for them. Stubbing once
// here beats the per-file `vi.stubGlobal('URL', ...)` each such test used to
// carry — and those stubs replaced the whole URL object, taking `createObjectURL`'s
// siblings with them.
if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => 'blob:mock')
}
if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = vi.fn()
}

/**
 * jsdom has no ResizeObserver, and anything that repositions itself when its
 * content changes (popovers) constructs one. The stub records every instance so
 * a test can drive a resize — `resizeObservers.at(-1)?.trigger()` — rather than
 * only proving the hook does not crash.
 */
export const resizeObservers: { target: Element | null; trigger: () => void }[] = []

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    private readonly entry: { target: Element | null; trigger: () => void }
    constructor(callback: () => void) {
      this.entry = { target: null, trigger: callback }
      resizeObservers.push(this.entry)
    }
    observe(target: Element) {
      this.entry.target = target
    }
    unobserve() {}
    disconnect() {
      const i = resizeObservers.indexOf(this.entry)
      if (i !== -1) resizeObservers.splice(i, 1)
    }
  }
}

afterEach(() => {
  cleanup()
  resizeObservers.length = 0
})
