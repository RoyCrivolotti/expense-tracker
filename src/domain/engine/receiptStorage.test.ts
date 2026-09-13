import { describe, expect, it } from 'vitest'
import { makeAttachment } from '../../testing/factories'
import { computeReceiptStorage, formatStorageSize } from './receiptStorage'

const LIMIT = 2_147_483_648

describe('computeReceiptStorage', () => {
  it('sums byteSize, which already includes each thumbnail', () => {
    // receiptService writes byteSize as fileBytes + thumbBytes.length and the
    // server enforces SUM(byte_size), so this must match it exactly rather than
    // approximate — a client-side undercount would promise room that is not there.
    const usage = computeReceiptStorage(
      [
        makeAttachment({ id: 1, byteSize: 400_000 }),
        makeAttachment({ id: 2, byteSize: 600_000 }),
      ],
      LIMIT,
    )
    expect(usage.usedBytes).toBe(1_000_000)
    expect(usage.count).toBe(2)
  })

  it('reports an empty store as zero rather than dividing by nothing', () => {
    const usage = computeReceiptStorage([], LIMIT)
    expect(usage).toMatchObject({ count: 0, usedBytes: 0, ratio: 0 })
  })

  it('clamps the ratio so a lowered cap cannot overflow the bar', () => {
    // The owner cap is overridable server-side by RECEIPT_MAX_OWNER_BYTES, so
    // stored bytes legitimately can exceed the figure this is drawn against.
    const usage = computeReceiptStorage([makeAttachment({ id: 1, byteSize: 5_000 })], 1_000)
    expect(usage.ratio).toBe(1)
  })

  it('survives a zero limit instead of returning Infinity or NaN', () => {
    expect(computeReceiptStorage([makeAttachment({ id: 1, byteSize: 10 })], 0).ratio).toBe(0)
    expect(computeReceiptStorage([], 0).ratio).toBe(0)
  })
})

describe('formatStorageSize', () => {
  it('uses decimal units, matching how Cloudflare reports R2', () => {
    expect(formatStorageSize(1_000_000)).toBe('1.0 MB')
    expect(formatStorageSize(2_147_483_648)).toBe('2.15 GB')
  })

  it('keeps small totals legible instead of rounding them to nothing', () => {
    // The reason this is not formatMb from receiptRules: that renders limits and
    // rounds MB to whole numbers, which turns every early total into "0 MB".
    expect(formatStorageSize(0)).toBe('0 B')
    expect(formatStorageSize(820)).toBe('820 B')
    expect(formatStorageSize(184_320)).toBe('184 KB')
    expect(formatStorageSize(1_500_000)).toBe('1.5 MB')
  })
})
