import { describe, expect, it } from 'vitest'
import type { Flag, Transaction, TransactionAttachment } from '../types'
import { buildReimbursementPack, packReceipts } from './reimbursementPack'

function flag(overrides: Partial<Flag> & { id: number }): Flag {
  return { name: 'Work travel', color: '#6366f1', sortOrder: 0, active: true, ...overrides }
}

function txn(id: number, date: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    date,
    budgetMonth: date.slice(0, 7),
    description: `Txn ${id}`,
    accountId: 1,
    categoryId: 1,
    type: 'expense',
    amountCents: 10_000,
    cancelled: false,
    status: 'posted',
    ...overrides,
  }
}

function attachment(id: number, transactionId: number): TransactionAttachment {
  return {
    id,
    transactionId,
    contentType: 'image/jpeg',
    byteSize: 1_000,
    createdAt: '2026-05-01T00:00:00Z',
    hasThumb: true,
  }
}

const WORK = flag({ id: 1 })

describe('buildReimbursementPack', () => {
  it('collects the flag’s transactions with their receipts', () => {
    const pack = buildReimbursementPack(
      1,
      [txn(1, '2026-05-02', { flagId: 1 }), txn(2, '2026-05-04', { flagId: 1 })],
      [WORK],
      [attachment(10, 1)],
    )

    expect(pack?.lines).toHaveLength(2)
    expect(pack?.lines[0]?.receipts.map((r) => r.id)).toEqual([10])
    expect(pack?.lines[1]?.receipts).toEqual([])
  })

  it('orders oldest first, unlike the rest of the app', () => {
    // A claim is read top to bottom as a record of a trip.
    const pack = buildReimbursementPack(
      1,
      [txn(1, '2026-05-09', { flagId: 1 }), txn(2, '2026-05-02', { flagId: 1 })],
      [WORK],
      [],
    )

    expect(pack?.lines.map((l) => l.transaction.date)).toEqual(['2026-05-02', '2026-05-09'])
  })

  it('reports the date range the claim covers', () => {
    const pack = buildReimbursementPack(
      1,
      [txn(1, '2026-05-09', { flagId: 1 }), txn(2, '2026-05-02', { flagId: 1 })],
      [WORK],
      [],
    )

    expect(pack).toMatchObject({ from: '2026-05-02', to: '2026-05-09' })
  })

  it('counts lines with no receipt — the thing that gets a claim sent back', () => {
    const pack = buildReimbursementPack(
      1,
      [txn(1, '2026-05-02', { flagId: 1 }), txn(2, '2026-05-04', { flagId: 1 })],
      [WORK],
      [attachment(10, 1)],
    )

    expect(pack?.missingReceipts).toBe(1)
  })

  it('totals the same figure the Flagged card shows', () => {
    const pack = buildReimbursementPack(
      1,
      [
        txn(1, '2026-05-02', { flagId: 1, amountCents: 10_000 }),
        txn(2, '2026-05-04', { flagId: 1, amountCents: 4_000, type: 'refund' }),
      ],
      [WORK],
      [],
    )

    // Refunds subtract, matching netSpendCents and the card.
    expect(pack?.totalCents).toBe(6_000)
  })

  it('excludes cancelled transactions, inheriting the card’s rule', () => {
    const pack = buildReimbursementPack(
      1,
      [
        txn(1, '2026-05-02', { flagId: 1 }),
        txn(2, '2026-05-04', { flagId: 1, cancelled: true, status: 'cancelled' }),
      ],
      [WORK],
      [],
    )

    expect(pack?.lines).toHaveLength(1)
  })

  it('is null for an archived flag, which is how a settled claim disappears', () => {
    expect(
      buildReimbursementPack(1, [txn(1, '2026-05-02', { flagId: 1 })], [flag({ id: 1, active: false })], []),
    ).toBeNull()
  })

  it('is null for a flag with nothing on it', () => {
    expect(buildReimbursementPack(1, [], [WORK], [])).toBeNull()
  })

  it('is null for a flag that does not exist', () => {
    expect(buildReimbursementPack(99, [txn(1, '2026-05-02', { flagId: 1 })], [WORK], [])).toBeNull()
  })

  it('ignores receipts belonging to other transactions', () => {
    const pack = buildReimbursementPack(
      1,
      [txn(1, '2026-05-02', { flagId: 1 })],
      [WORK],
      [attachment(10, 1), attachment(11, 999)],
    )

    expect(pack?.lines[0]?.receipts.map((r) => r.id)).toEqual([10])
  })
})

describe('packReceipts', () => {
  it('flattens every receipt in line order, keeping its transaction', () => {
    const pack = buildReimbursementPack(
      1,
      [txn(1, '2026-05-02', { flagId: 1 }), txn(2, '2026-05-04', { flagId: 1 })],
      [WORK],
      [attachment(10, 2), attachment(11, 1), attachment(12, 1)],
    )

    expect(packReceipts(pack!).map((r) => [r.attachment.id, r.transaction.id])).toEqual([
      [11, 1],
      [12, 1],
      [10, 2],
    ])
  })

  it('is empty for a claim with no receipts at all', () => {
    const pack = buildReimbursementPack(1, [txn(1, '2026-05-02', { flagId: 1 })], [WORK], [])

    expect(packReceipts(pack!)).toEqual([])
  })
})
