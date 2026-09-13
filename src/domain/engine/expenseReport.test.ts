import { describe, expect, it } from 'vitest'
import type { Flag, Transaction, TransactionAttachment } from '../types'
import {
  buildExpenseReport,
  buildSettledReport,
  reportReceipts,
  reportReference,
} from './expenseReport'

function flag(overrides: Partial<Flag> & { id: number }): Flag {
  return { name: 'Work travel', color: '#6366f1', reimbursable: true, sortOrder: 0, active: true, ...overrides }
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

describe('buildExpenseReport', () => {
  it('collects the flag’s transactions with their receipts', () => {
    const report = buildExpenseReport(
      1,
      [txn(1, '2026-05-02', { flagId: 1 }), txn(2, '2026-05-04', { flagId: 1 })],
      [WORK],
      [attachment(10, 1)],
    )

    expect(report?.lines).toHaveLength(2)
    expect(report?.lines[0]?.receipts.map((r) => r.id)).toEqual([10])
    expect(report?.lines[1]?.receipts).toEqual([])
  })

  it('orders oldest first, unlike the rest of the app', () => {
    // A claim is read top to bottom as a record of a trip.
    const report = buildExpenseReport(
      1,
      [txn(1, '2026-05-09', { flagId: 1 }), txn(2, '2026-05-02', { flagId: 1 })],
      [WORK],
      [],
    )

    expect(report?.lines.map((l) => l.transaction.date)).toEqual(['2026-05-02', '2026-05-09'])
  })

  it('reports the date range the claim covers', () => {
    const report = buildExpenseReport(
      1,
      [txn(1, '2026-05-09', { flagId: 1 }), txn(2, '2026-05-02', { flagId: 1 })],
      [WORK],
      [],
    )

    expect(report).toMatchObject({ from: '2026-05-02', to: '2026-05-09' })
  })

  it('counts lines with no receipt — the thing that gets a claim sent back', () => {
    const report = buildExpenseReport(
      1,
      [txn(1, '2026-05-02', { flagId: 1 }), txn(2, '2026-05-04', { flagId: 1 })],
      [WORK],
      [attachment(10, 1)],
    )

    expect(report?.missingReceipts).toHaveLength(1)
  })

  it('splits refunds out of the claim and into credits', () => {
    const report = buildExpenseReport(
      1,
      [
        txn(1, '2026-05-02', { flagId: 1, amountCents: 10_000 }),
        txn(2, '2026-06-14', { flagId: 1, amountCents: 4_000, type: 'refund' }),
      ],
      [WORK],
      [],
    )

    // A settlement carries the same flag. Left among the claimed rows it put a
    // negative line in the document you submit.
    expect(report?.lines).toHaveLength(1)
    expect(report?.credits).toHaveLength(1)
    expect(report?.totalClaimedCents).toBe(10_000)
    expect(report?.creditedCents).toBe(4_000)
    // Outstanding still matches netSpendCents and the card.
    expect(report?.outstandingCents).toBe(6_000)
  })

  it('keeps the header period to the claimed dates, not the settlement date', () => {
    const report = buildExpenseReport(
      1,
      [
        txn(1, '2026-05-02', { flagId: 1 }),
        txn(2, '2026-05-09', { flagId: 1 }),
        txn(3, '2026-06-14', { flagId: 1, amountCents: 20_000, type: 'refund' }),
      ],
      [WORK],
      [],
    )

    expect(report?.from).toBe('2026-05-02')
    expect(report?.to).toBe('2026-05-09')
    expect(report?.lines).toHaveLength(2)
  })

  it('does not count a credit as an item missing its receipt', () => {
    const report = buildExpenseReport(
      1,
      [
        txn(1, '2026-05-02', { flagId: 1 }),
        txn(2, '2026-06-14', { flagId: 1, amountCents: 10_000, type: 'refund' }),
      ],
      [WORK],
      [attachment(1, 1)],
    )

    // Otherwise every settled claim warns that one item has no receipt.
    expect(report?.missingReceipts).toHaveLength(0)
  })

  it('numbers receipts across the claim so a row can be tied to a figure', () => {
    const report = buildExpenseReport(
      1,
      [txn(1, '2026-05-02', { flagId: 1 }), txn(2, '2026-05-04', { flagId: 1 })],
      [WORK],
      [attachment(1, 1), attachment(2, 1), attachment(3, 2)],
    )

    expect(report?.lines[0]?.receiptRefs).toEqual([1, 2])
    expect(report?.lines[1]?.receiptRefs).toEqual([3])
    expect(reportReceipts(report!).map((r) => r.ref)).toEqual([1, 2, 3])
  })

  it('leaves already-reimbursed rows out, so the next claim is only the new spend', () => {
    // This is what lets one flag be durable. Without it a second claim on
    // "Work travel" re-lists June alongside July under one reference, with
    // June's payment netted at the bottom — which finance would bounce.
    const pack = buildExpenseReport(
      1,
      [
        txn(1, '2026-05-02', { flagId: 1, settledBy: 99 }),
        txn(2, '2026-05-09', { flagId: 1, settledBy: 99 }),
        txn(3, '2026-07-03', { flagId: 1, amountCents: 5_000 }),
      ],
      [WORK],
      [],
    )

    expect(pack?.lines).toHaveLength(1)
    expect(pack?.from).toBe('2026-07-03')
    expect(pack?.totalClaimedCents).toBe(5_000)
  })

  it('gives the next claim its own reference, since the period moved', () => {
    const june = buildExpenseReport(
      1,
      [txn(1, '2026-05-02', { flagId: 1 })],
      [WORK],
      [],
    )
    const july = buildExpenseReport(
      1,
      [txn(1, '2026-05-02', { flagId: 1, settledBy: 99 }), txn(2, '2026-07-03', { flagId: 1 })],
      [WORK],
      [],
    )

    expect(reportReference(june!)).not.toBe(reportReference(july!))
  })

  it('rebuilds a past report from the payment that settled it', () => {
    // The flag has moved on to new spending; this is the only way to answer
    // "send me the June one again" months later.
    const report = buildSettledReport(
      99,
      [
        txn(1, '2026-05-02', { flagId: 1, settledBy: 99, amountCents: 10_000 }),
        txn(2, '2026-05-09', { flagId: 1, settledBy: 99, amountCents: 4_000 }),
        txn(3, '2026-07-03', { flagId: 1, amountCents: 5_000 }),
      ],
      [WORK],
      [],
    )

    expect(report?.lines.map((l) => l.transaction.id)).toEqual([1, 2])
    expect(report?.totalClaimedCents).toBe(14_000)
    expect(report?.from).toBe('2026-05-02')
    expect(report?.flag.id).toBe(1)
  })

  it('is null for a payment that settled nothing', () => {
    expect(buildSettledReport(99, [txn(1, '2026-05-02', { flagId: 1 })], [WORK], [])).toBeNull()
  })

  it('still builds for an archived flag, so a settled report can be reprinted', () => {
    const report = buildExpenseReport(
      1,
      [txn(1, '2026-05-02', { flagId: 1 })],
      [flag({ id: 1, active: false })],
      [],
    )

    // Archiving is how a claim is marked done, and a done claim is exactly the
    // one an employer asks to see again.
    expect(report?.lines).toHaveLength(1)
  })

  it('excludes cancelled transactions, inheriting the card’s rule', () => {
    const report = buildExpenseReport(
      1,
      [
        txn(1, '2026-05-02', { flagId: 1 }),
        txn(2, '2026-05-04', { flagId: 1, cancelled: true, status: 'cancelled' }),
      ],
      [WORK],
      [],
    )

    expect(report?.lines).toHaveLength(1)
  })

  it('is null for a flag with nothing on it', () => {
    expect(buildExpenseReport(1, [], [WORK], [])).toBeNull()
  })

  it('is null for a flag that does not exist', () => {
    expect(buildExpenseReport(99, [txn(1, '2026-05-02', { flagId: 1 })], [WORK], [])).toBeNull()
  })

  it('ignores receipts belonging to other transactions', () => {
    const report = buildExpenseReport(
      1,
      [txn(1, '2026-05-02', { flagId: 1 })],
      [WORK],
      [attachment(10, 1), attachment(11, 999)],
    )

    expect(report?.lines[0]?.receipts.map((r) => r.id)).toEqual([10])
  })
})

describe('reportReceipts', () => {
  it('flattens every receipt in line order, keeping its transaction', () => {
    const report = buildExpenseReport(
      1,
      [txn(1, '2026-05-02', { flagId: 1 }), txn(2, '2026-05-04', { flagId: 1 })],
      [WORK],
      [attachment(10, 2), attachment(11, 1), attachment(12, 1)],
    )

    expect(reportReceipts(report!).map((r) => [r.attachment.id, r.transaction.id])).toEqual([
      [11, 1],
      [12, 1],
      [10, 2],
    ])
  })

  it('is empty for a claim with no receipts at all', () => {
    const report = buildExpenseReport(1, [txn(1, '2026-05-02', { flagId: 1 })], [WORK], [])

    expect(reportReceipts(report!)).toEqual([])
  })
})
