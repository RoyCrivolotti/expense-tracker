/**
 * Pure rules for what may be stored as a receipt, and how it is served.
 *
 * Kept free of Workers and DOM APIs so both the upload route and the client can
 * apply the same limits, and so the security-critical part — deciding a file's
 * type from its bytes rather than from what the client claimed — is exhaustively
 * testable.
 */

export type ReceiptContentType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'

export interface ReceiptLimits {
  maxFileBytes: number
  maxPerTransaction: number
  maxOwnerBytes: number
}

/**
 * Deliberately short. No SVG: it is a scriptable document, and serving one from
 * the app's own origin would be stored XSS. No HEIC: Chrome cannot decode it, so
 * it could be neither downscaled in the browser nor displayed after upload —
 * accepting it would mean some phones silently uploading 4 MB originals that
 * nothing can render.
 */
const SIGNATURES: { type: ReceiptContentType; test: (b: Uint8Array) => boolean }[] = [
  { type: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: 'image/png',
    test: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    type: 'image/webp',
    test: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  {
    type: 'application/pdf',
    test: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d,
  },
]

/**
 * The type of `bytes`, from `bytes` — never from a Content-Type header or a
 * filename, both of which the client controls. Returns null for anything not on
 * the allowlist, which the caller must treat as a rejection.
 */
export function sniffContentType(bytes: Uint8Array): ReceiptContentType | null {
  if (bytes.length < 12) return null
  return SIGNATURES.find((s) => s.test(bytes))?.type ?? null
}

/** Only raster images get a downscaled preview; a PDF has no thumbnail. */
export function supportsThumbnail(type: ReceiptContentType): boolean {
  return type !== 'application/pdf'
}

export function extensionFor(type: ReceiptContentType): string {
  if (type === 'image/jpeg') return 'jpg'
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  return 'pdf'
}

export type RejectionReason =
  | { kind: 'empty' }
  | { kind: 'unsupported-type' }
  | { kind: 'too-large'; limit: number }
  | { kind: 'too-many'; limit: number }
  | { kind: 'owner-quota'; limit: number }

export function rejectionMessage(reason: RejectionReason): string {
  if (reason.kind === 'empty') return 'The file is empty'
  if (reason.kind === 'unsupported-type') {
    return 'Receipts must be a JPEG, PNG, WebP or PDF'
  }
  if (reason.kind === 'too-large') {
    return `Receipts must be ${formatMb(reason.limit)} or smaller`
  }
  if (reason.kind === 'too-many') {
    return `A transaction can hold ${reason.limit} receipt${reason.limit === 1 ? '' : 's'}`
  }
  return `Receipt storage is full (${formatMb(reason.limit)}). Delete some receipts to add more.`
}

function formatMb(bytes: number): string {
  const mb = bytes / 1_000_000
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`
}

export interface UploadCheck {
  bytes: Uint8Array
  existingCount: number
  ownerBytesUsed: number
  limits: ReceiptLimits
}

/**
 * Everything that must hold before bytes are written to R2, in one place so the
 * route cannot accidentally skip one. Returns the sniffed type on success.
 */
export function checkUpload(
  input: UploadCheck,
): { ok: true; contentType: ReceiptContentType } | { ok: false; reason: RejectionReason } {
  const { bytes, existingCount, ownerBytesUsed, limits } = input
  if (bytes.length === 0) return { ok: false, reason: { kind: 'empty' } }
  if (bytes.length > limits.maxFileBytes) {
    return { ok: false, reason: { kind: 'too-large', limit: limits.maxFileBytes } }
  }
  if (existingCount >= limits.maxPerTransaction) {
    return { ok: false, reason: { kind: 'too-many', limit: limits.maxPerTransaction } }
  }
  if (ownerBytesUsed + bytes.length > limits.maxOwnerBytes) {
    return { ok: false, reason: { kind: 'owner-quota', limit: limits.maxOwnerBytes } }
  }
  const contentType = sniffContentType(bytes)
  if (!contentType) return { ok: false, reason: { kind: 'unsupported-type' } }
  return { ok: true, contentType }
}

/**
 * Response headers for serving user-uploaded bytes from the app's own origin.
 *
 * This is the highest-risk surface in the feature, and the app has no site-wide
 * CSP, so the per-response policy here is the only thing standing between a file
 * that slipped the sniffer and script execution on the app's origin. A separate
 * hostname for user content would be the textbook answer; for a single-user
 * tracker behind Cloudflare Access these headers are the proportionate one.
 *
 * PDFs are always `attachment`: some viewers execute JavaScript embedded in a
 * PDF, and inline rendering would give that script the app's origin.
 */
export function serveHeaders(
  contentType: ReceiptContentType,
  filename: string | undefined,
  etag: string,
): Record<string, string> {
  const disposition = contentType === 'application/pdf' ? 'attachment' : 'inline'
  return {
    'content-type': contentType,
    'content-disposition': dispositionHeader(disposition, filename),
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox; base-uri 'none'; form-action 'none'",
    'cross-origin-resource-policy': 'same-origin',
    // Keys are content-addressed, so a given URL's bytes never change.
    'cache-control': 'private, max-age=31536000, immutable',
    etag,
  }
}

/**
 * A filename reaches this header from user input, so it is quoted and stripped
 * of anything that could close the quote or inject a header.
 */
function dispositionHeader(disposition: string, filename: string | undefined): string {
  if (!filename) return disposition
  const safe = filename.replace(/[^\w.\- ]/g, '_').slice(0, 100)
  return `${disposition}; filename="${safe}"`
}
