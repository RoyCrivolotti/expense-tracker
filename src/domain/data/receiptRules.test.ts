import { describe, expect, it } from 'vitest'
import {
  checkThumb,
  checkUpload,
  extensionFor,
  rejectionMessage,
  serveHeaders,
  sniffContentType,
  supportsThumbnail,
  type ReceiptLimits,
} from './receiptRules'

function bytes(...head: number[]): Uint8Array {
  const out = new Uint8Array(32)
  out.set(head)
  return out
}

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0)
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d)

const limits: ReceiptLimits = {
  maxFileBytes: 5_000_000,
  maxPerTransaction: 4,
  maxOwnerBytes: 2_000_000_000,
}

describe('sniffContentType', () => {
  it('identifies each allowed type from its bytes', () => {
    expect(sniffContentType(JPEG)).toBe('image/jpeg')
    expect(sniffContentType(PNG)).toBe('image/png')
    expect(sniffContentType(WEBP)).toBe('image/webp')
    expect(sniffContentType(PDF)).toBe('application/pdf')
  })

  it('rejects SVG, which would be stored XSS if served from our origin', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')
    expect(sniffContentType(svg)).toBeNull()
  })

  it('rejects HTML dressed up as an image', () => {
    expect(sniffContentType(new TextEncoder().encode('<!doctype html><script>x</script>'))).toBeNull()
  })

  it('rejects HEIC, which no desktop browser can decode', () => {
    // ftypheic at offset 4 — a real HEIC header, deliberately not on the list.
    const heic = bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63)
    expect(sniffContentType(heic)).toBeNull()
  })

  it('rejects a RIFF container that is not WebP', () => {
    // A WAV file: same RIFF magic, different form type.
    expect(sniffContentType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45))).toBeNull()
  })

  it('rejects anything too short to carry a signature', () => {
    expect(sniffContentType(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull()
  })
})

describe('checkUpload', () => {
  const base = { existingCount: 0, ownerBytesUsed: 0, limits }

  it('accepts a well-formed receipt and reports its real type', () => {
    expect(checkUpload({ ...base, bytes: JPEG })).toEqual({ ok: true, contentType: 'image/jpeg' })
  })

  it('rejects an empty file', () => {
    expect(checkUpload({ ...base, bytes: new Uint8Array(0) })).toEqual({
      ok: false,
      reason: { kind: 'empty' },
    })
  })

  it('rejects a file over the per-file limit', () => {
    const big = new Uint8Array(limits.maxFileBytes + 1)
    big.set([0xff, 0xd8, 0xff])
    expect(checkUpload({ ...base, bytes: big })).toEqual({
      ok: false,
      reason: { kind: 'too-large', limit: limits.maxFileBytes },
    })
  })

  it('rejects once a transaction is full', () => {
    expect(checkUpload({ ...base, bytes: JPEG, existingCount: 4 })).toEqual({
      ok: false,
      reason: { kind: 'too-many', limit: 4 },
    })
  })

  it('rejects when the owner would cross the storage quota', () => {
    expect(
      checkUpload({ ...base, bytes: JPEG, ownerBytesUsed: limits.maxOwnerBytes }),
    ).toEqual({ ok: false, reason: { kind: 'owner-quota', limit: limits.maxOwnerBytes } })
  })

  it('checks size before type, so a huge unsupported file is not sniffed', () => {
    const big = new Uint8Array(limits.maxFileBytes + 1)
    expect(checkUpload({ ...base, bytes: big })).toMatchObject({
      reason: { kind: 'too-large' },
    })
  })

  it('rejects an unsupported type even when every size check passes', () => {
    expect(checkUpload({ ...base, bytes: bytes(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12) })).toEqual({
      ok: false,
      reason: { kind: 'unsupported-type' },
    })
  })
})

describe('rejectionMessage', () => {
  it('names the limit in units a person reads', () => {
    expect(rejectionMessage({ kind: 'too-large', limit: 5_000_000 })).toBe(
      'Receipts must be 5 MB or smaller',
    )
    expect(rejectionMessage({ kind: 'owner-quota', limit: 2_000_000_000 })).toContain('2.0 GB')
  })

  it('singularises a one-receipt limit', () => {
    expect(rejectionMessage({ kind: 'too-many', limit: 1 })).toBe('A transaction can hold 1 receipt')
    expect(rejectionMessage({ kind: 'too-many', limit: 4 })).toBe('A transaction can hold 4 receipts')
  })

  it('says what is allowed, not just what was refused', () => {
    expect(rejectionMessage({ kind: 'unsupported-type' })).toMatch(/JPEG, PNG, WebP or PDF/)
  })

  it('has a message for an empty file', () => {
    expect(rejectionMessage({ kind: 'empty' })).toBe('The file is empty')
  })
})

describe('serveHeaders', () => {
  it('locks a served image down with nosniff and a deny-all CSP', () => {
    const headers = serveHeaders('image/jpeg', 'hotel.jpg', '"abc"')

    expect(headers['content-type']).toBe('image/jpeg')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['content-security-policy']).toContain("default-src 'none'")
    expect(headers['content-security-policy']).toContain('sandbox')
    expect(headers['cross-origin-resource-policy']).toBe('same-origin')
    expect(headers['content-disposition']).toBe('inline; filename="hotel.jpg"')
  })

  it('forces a PDF to download, because some viewers run scripts inside one', () => {
    expect(serveHeaders('application/pdf', 'invoice.pdf', '"x"')['content-disposition']).toBe(
      'attachment; filename="invoice.pdf"',
    )
  })

  it('neutralises a filename that would break out of the header', () => {
    const headers = serveHeaders('image/png', 'a";\r\nX-Evil: 1;.png', '"x"')

    expect(headers['content-disposition']).not.toContain('\r')
    expect(headers['content-disposition']).not.toContain('X-Evil: 1')
    expect(headers['content-disposition']).toBe('inline; filename="a____X-Evil_ 1_.png"')
  })

  it('omits the filename when there is none rather than writing an empty one', () => {
    expect(serveHeaders('image/png', undefined, '"x"')['content-disposition']).toBe('inline')
  })

  it('caches immutably, which content-addressed keys make safe', () => {
    expect(serveHeaders('image/png', 'a.png', '"x"')['cache-control']).toBe(
      'private, max-age=31536000, immutable',
    )
  })
})

describe('type helpers', () => {
  it('gives raster images a thumbnail and PDFs none', () => {
    expect(supportsThumbnail('image/jpeg')).toBe(true)
    expect(supportsThumbnail('application/pdf')).toBe(false)
  })

  it('maps each type to its extension', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg')
    expect(extensionFor('image/png')).toBe('png')
    expect(extensionFor('image/webp')).toBe('webp')
    expect(extensionFor('application/pdf')).toBe('pdf')
  })
})

describe('checkThumb', () => {
  it('accepts a raster preview', () => {
    expect(checkThumb(JPEG, limits)).toEqual({ ok: true })
  })

  it('rejects a preview that is not a raster image', () => {
    // A thumbnail is something we rendered from a canvas; a PDF here means the
    // caller is not the app.
    expect(checkThumb(PDF, limits)).toEqual({ ok: false, reason: { kind: 'unsupported-type' } })
  })

  it('rejects an unsniffable preview', () => {
    expect(checkThumb(bytes(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12), limits)).toEqual({
      ok: false,
      reason: { kind: 'unsupported-type' },
    })
  })

  it('caps the preview size, so a raw API call cannot store an unbounded "thumb"', () => {
    const big = new Uint8Array(limits.maxFileBytes + 1)
    big.set([0xff, 0xd8, 0xff])

    expect(checkThumb(big, limits)).toEqual({
      ok: false,
      reason: { kind: 'too-large', limit: limits.maxFileBytes },
    })
  })

  it('rejects an empty preview', () => {
    expect(checkThumb(new Uint8Array(0), limits)).toEqual({ ok: false, reason: { kind: 'empty' } })
  })
})
