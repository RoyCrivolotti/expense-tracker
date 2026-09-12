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

afterEach(() => {
  cleanup()
})
