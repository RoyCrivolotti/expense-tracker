import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from './money'
import { namedReceipts, receiptExtension, receiptFileName, receiptPackName } from './receiptFiles'
import { makeAttachment, makeTransaction } from '../../testing/factories'

describe('receiptExtension', () => {
  it('maps every type the server will ever store', () => {
    expect(receiptExtension('image/jpeg')).toBe('jpg')
    expect(receiptExtension('image/png')).toBe('png')
    expect(receiptExtension('image/webp')).toBe('webp')
    expect(receiptExtension('application/pdf')).toBe('pdf')
  })

  it('falls back rather than producing a file with no extension', () => {
    expect(receiptExtension('application/octet-stream')).toBe('bin')
  })
})

describe('receiptFileName', () => {
  it('leads with the reference, so files sort into report order', () => {
    expect(
      receiptFileName(1, 'Tren por trabajo', '2026-08-19', 17_526, 'image/jpeg', EU_MONEY_FORMAT),
    ).toBe('R1 - 2026-08-19 - Tren por trabajo - 175,26 €.jpg')
  })

  it('strips characters that break a filename on some OS', () => {
    // "/" is a path separator everywhere, ":" is one on macOS, and the rest are
    // reserved on Windows — a receipt named after a description containing them
    // would fail to extract rather than fail to look nice.
    const name = receiptFileName(2, 'Taxi: airport/hotel *urgent?*', '2026-08-20', 1_000, 'image/png', EU_MONEY_FORMAT)
    expect(name).toBe('R2 - 2026-08-20 - Taxi airport hotel urgent - 10,00 €.png')
  })

  it('survives an empty description instead of leaving a dangling separator', () => {
    expect(receiptFileName(3, '', '2026-08-21', 500, 'application/pdf', EU_MONEY_FORMAT)).toBe(
      'R3 - 2026-08-21 - 5,00 €.pdf',
    )
  })

  it('never ends a segment in a space or dot, which Windows refuses', () => {
    expect(receiptFileName(4, 'Hotel  ', '2026-08-22', 100, 'image/jpeg', EU_MONEY_FORMAT)).toContain(
      'Hotel - ',
    )
  })
})

describe('receiptPackName', () => {
  it('names the folder after the claim and its period', () => {
    expect(receiptPackName('Work travel', '2026-08-19')).toBe('Work travel 2026-08 receipts')
  })

  it('copes with a report that has no dated lines', () => {
    expect(receiptPackName('Work travel', '')).toBe('Work travel receipts')
  })

  it('falls back without doubling the word when the name sanitises to nothing', () => {
    expect(receiptPackName('///', '')).toBe('Receipts')
    expect(receiptPackName('///', '2026-08-19')).toBe('Receipts 2026-08')
  })
})

describe('namedReceipts', () => {
  it('names every figure, keeping its attachment id for fetching', () => {
    const figures = [
      {
        attachment: makeAttachment({ id: 5, contentType: 'image/jpeg' }),
        transaction: makeTransaction({ id: 1, date: '2026-08-19', amountCents: 17_526, description: 'Tren' }),
        ref: 1,
      },
      {
        attachment: makeAttachment({ id: 6, contentType: 'application/pdf' }),
        transaction: makeTransaction({ id: 2, date: '2026-09-06', amountCents: 3_235, description: '' }),
        ref: 2,
      },
    ]

    // The label is passed in rather than re-derived, because the report already
    // falls back to the category name for a blank description and the files
    // must say the same thing the table does.
    expect(namedReceipts(figures, EU_MONEY_FORMAT, (f) => f.transaction.description || 'Dining out')).toEqual([
      { attachmentId: 5, filename: 'R1 - 2026-08-19 - Tren - 175,26 €.jpg' },
      { attachmentId: 6, filename: 'R2 - 2026-09-06 - Dining out - 32,35 €.pdf' },
    ])
  })

  it('is empty for a report with no receipts', () => {
    expect(namedReceipts([], EU_MONEY_FORMAT, () => 'x')).toEqual([])
  })
})
