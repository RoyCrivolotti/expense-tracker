import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from './money'
import { receiptExtension, receiptFileName, receiptPackName } from './receiptFiles'

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
