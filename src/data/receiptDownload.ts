import type { NamedReceipt } from '../domain/engine/receiptFiles'

export type ReceiptDelivery = 'shared' | 'zipped'

/**
 * The browser bits, isolated behind an interface — the same shape
 * `imageDownscale.ts` uses, and for the same reason: jsdom implements none of
 * this, so the orchestration around it can only be tested by injecting fakes.
 */
export interface ReceiptDeliveryDeps {
  fetchReceipt(attachmentId: number): Promise<Blob>
  canShareFiles(files: File[]): boolean
  shareFiles(files: File[], title: string): Promise<void>
  saveBlob(blob: Blob, filename: string): void
}

export const browserReceiptDelivery: ReceiptDeliveryDeps = {
  fetchReceipt: async (attachmentId) => {
    const res = await fetch(`/api/expenses/attachments/${attachmentId}`)
    if (!res.ok) throw new Error(`Could not load receipt ${attachmentId}`)
    return res.blob()
  },
  // Feature-detected rather than sniffed: Safari on iOS shares files, Chrome on
  // Android shares files, and desktop support varies by OS and version. Asking
  // canShare about the actual files is the only reliable answer.
  canShareFiles: (files) =>
    typeof navigator.canShare === 'function' && navigator.canShare({ files }),
  shareFiles: (files, title) => navigator.share({ files, title }),
  saveBlob: (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },
}

/**
 * Hand the claim's receipts over as files, by whichever route the device has.
 *
 * **Share sheet where it exists**, which is the phone case and the one that
 * matters: it puts the images straight into Mail, Messages, AirDrop or Save to
 * Photos. A plain download cannot reach the Photos library at all — no web page
 * can — so on a phone the share sheet is not a nicety, it is the only route to
 * where the files are actually wanted.
 *
 * **A single zip otherwise**, which is the desktop case. Triggering one download
 * per receipt asks the browser to allow multiple downloads and scatters loose
 * files through Downloads; one archive attaches to an email in one go.
 *
 * fflate is imported dynamically so a phone that shares never pays for a zip
 * encoder it will not run.
 */
export async function deliverReceipts(
  receipts: NamedReceipt[],
  packName: string,
  deps: ReceiptDeliveryDeps = browserReceiptDelivery,
): Promise<ReceiptDelivery> {
  if (receipts.length === 0) throw new Error('This report has no receipts to send')

  const blobs = await Promise.all(receipts.map((r) => deps.fetchReceipt(r.attachmentId)))
  const files = blobs.map(
    (blob, i) => new File([blob], receipts[i]!.filename, { type: blob.type }),
  )

  if (deps.canShareFiles(files)) {
    await deps.shareFiles(files, packName)
    return 'shared'
  }

  const { zipSync } = await import('fflate')
  const entries: Record<string, Uint8Array> = {}
  for (const [i, file] of files.entries()) {
    entries[`${packName}/${receipts[i]!.filename}`] = new Uint8Array(await file.arrayBuffer())
  }
  // level 0: receipts are already JPEG, PNG or PDF — all compressed. Deflating
  // them again costs time and memory on a phone and saves almost nothing.
  const zipped = zipSync(entries, { level: 0 })
  deps.saveBlob(new Blob([zipped], { type: 'application/zip' }), `${packName}.zip`)
  return 'zipped'
}
