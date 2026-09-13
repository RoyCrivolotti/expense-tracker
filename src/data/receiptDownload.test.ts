import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NamedReceipt } from '../domain/engine/receiptFiles'
import {
  browserReceiptDelivery,
  deliverReceipts,
  type ReceiptDeliveryDeps,
} from './receiptDownload'

const receipts: NamedReceipt[] = [
  { attachmentId: 5, filename: 'R1 - 2026-08-19 - Tren - 175,26 €.jpg' },
  { attachmentId: 6, filename: 'R2 - 2026-09-06 - Cena - 32,35 €.pdf' },
]

/**
 * Mocks held as locals rather than read back off the deps object: ESLint's
 * unbound-method rule rejects `expect(deps.saveBlob)`, and rightly so.
 */
function harness(overrides: Partial<ReceiptDeliveryDeps> = {}) {
  const fetchReceipt = vi.fn((id: number) =>
    Promise.resolve(new Blob([`bytes-${id}`], { type: 'image/jpeg' })),
  )
  const canShareFiles = vi.fn(() => false)
  const shareFiles = vi.fn((_files: File[], _title: string) => Promise.resolve())
  const saveBlob = vi.fn()
  const deps: ReceiptDeliveryDeps = {
    fetchReceipt,
    canShareFiles,
    shareFiles,
    saveBlob,
    ...overrides,
  }
  return { deps, fetchReceipt, canShareFiles, shareFiles, saveBlob }
}

describe('deliverReceipts', () => {
  it('uses the share sheet when the device has one', async () => {
    // The phone case, and the only route to Mail or the Photos library — a
    // download cannot reach either.
    const { deps, shareFiles, saveBlob } = harness({ canShareFiles: vi.fn(() => true) })
    await expect(deliverReceipts(receipts, 'Work travel 2026-08 receipts', deps)).resolves.toBe(
      'shared',
    )

    const [files, title] = shareFiles.mock.calls[0]!
    expect(files.map((f) => f.name)).toEqual(receipts.map((r) => r.filename))
    expect(title).toBe('Work travel 2026-08 receipts')
    expect(saveBlob).not.toHaveBeenCalled()
  })

  it('falls back to one zip rather than one download per receipt', async () => {
    const { deps, shareFiles, saveBlob } = harness()
    await expect(deliverReceipts(receipts, 'Work travel 2026-08 receipts', deps)).resolves.toBe(
      'zipped',
    )

    expect(shareFiles).not.toHaveBeenCalled()
    const [blob, filename] = saveBlob.mock.calls[0]! as [Blob, string]
    expect(filename).toBe('Work travel 2026-08 receipts.zip')
    expect(blob.type).toBe('application/zip')
    // A real archive, not an empty placeholder: "PK" is the zip magic number.
    expect(await blob.slice(0, 2).text()).toBe('PK')
  })

  it('puts the receipts in a named folder inside the zip', async () => {
    const { deps, saveBlob } = harness()
    await deliverReceipts(receipts, 'Work travel 2026-08 receipts', deps)
    const [blob] = saveBlob.mock.calls[0]! as [Blob, string]
    // Extracting into the current directory should not scatter loose files.
    expect(await blob.text()).toContain('Work travel 2026-08 receipts/R1 - 2026-08-19')
  })

  it('fetches every receipt, not just the first', async () => {
    const { deps, fetchReceipt } = harness()
    await deliverReceipts(receipts, 'pack', deps)
    expect(fetchReceipt).toHaveBeenCalledTimes(2)
    expect(fetchReceipt).toHaveBeenCalledWith(5)
    expect(fetchReceipt).toHaveBeenCalledWith(6)
  })

  it('refuses a report with no receipts instead of sending an empty archive', async () => {
    const { deps, saveBlob } = harness()
    await expect(deliverReceipts([], 'pack', deps)).rejects.toThrow('no receipts')
    expect(saveBlob).not.toHaveBeenCalled()
  })

  it('surfaces a failed fetch rather than sending a partial pack', async () => {
    // Half a claim's receipts is worse than none: it would be sent believing it
    // was complete.
    const { deps, saveBlob, shareFiles } = harness({
      fetchReceipt: vi.fn((id: number) =>
        id === 6
          ? Promise.reject(new Error('Could not load receipt 6'))
          : Promise.resolve(new Blob(['ok'])),
      ),
    })
    await expect(deliverReceipts(receipts, 'pack', deps)).rejects.toThrow('Could not load receipt 6')
    expect(saveBlob).not.toHaveBeenCalled()
    expect(shareFiles).not.toHaveBeenCalled()
  })
})

/**
 * The real browser implementations. jsdom has none of these for real, but each
 * is thin enough that stubbing the global and asserting the call is worth more
 * than leaving the default path untested — a typo in the fetch URL or a missing
 * `download` attribute would otherwise only show up on a device.
 */
describe('browserReceiptDelivery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('fetches a receipt from the serve route by id', async () => {
    const blob = new Blob(['bytes'])
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(blob) }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(browserReceiptDelivery.fetchReceipt(42)).resolves.toBe(blob)
    expect(fetchMock).toHaveBeenCalledWith('/api/expenses/attachments/42')
  })

  it('throws on a non-ok response rather than zipping an error page', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 404 })))
    await expect(browserReceiptDelivery.fetchReceipt(42)).rejects.toThrow('Could not load receipt 42')
  })

  it('reports no sharing when the browser has no canShare at all', () => {
    vi.stubGlobal('navigator', {})
    expect(browserReceiptDelivery.canShareFiles([])).toBe(false)
  })

  it('asks canShare about the actual files, not just for the API', () => {
    const files = [new File(['x'], 'R1.jpg')]
    const canShare = vi.fn(() => true)
    vi.stubGlobal('navigator', { canShare })

    expect(browserReceiptDelivery.canShareFiles(files)).toBe(true)
    expect(canShare).toHaveBeenCalledWith({ files })
  })

  it('passes the files and a title to the share sheet', async () => {
    const share = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { share })
    const files = [new File(['x'], 'R1.jpg')]

    await browserReceiptDelivery.shareFiles(files, 'Work travel receipts')
    expect(share).toHaveBeenCalledWith({ files, title: 'Work travel receipts' })
  })

  it('saves a blob through an anchor, and releases the object URL', () => {
    const revoked: string[] = []
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:x'),
      revokeObjectURL: vi.fn((u: string) => revoked.push(u)),
    })
    const anchor = document.createElement('a')
    const click = vi.spyOn(anchor, 'click').mockImplementation(() => {})
    vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor)

    browserReceiptDelivery.saveBlob(new Blob(['z']), 'pack.zip')

    expect(anchor.download).toBe('pack.zip')
    expect(anchor.href).toBe('blob:x')
    expect(click).toHaveBeenCalled()
    // Leaking it pins the whole archive in memory for the life of the document.
    expect(revoked).toEqual(['blob:x'])
  })
})
