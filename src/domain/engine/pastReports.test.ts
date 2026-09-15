import { describe, expect, it } from 'vitest'
import type { Transaction } from '../types'
import { makeFlag, makeTransaction } from '../../testing/factories'
import { listPastReports, pastReportDrifted } from './pastReports'

const WORK = makeFlag({ id: 4, name: 'Work travel' })

const payment = (id: number, date: string, description = 'Alicante expenses, September 2026') =>
  makeTransaction({ id, date, description, type: 'refund', amountCents: 12_000 })

const covered = (id: number, settledBy: number, overrides: Partial<Transaction> = {}) =>
  makeTransaction({ id, flagId: 4, settledBy, amountCents: 10_000, ...overrides })

describe('listPastReports', () => {
  it('lists one entry per payment, with what it covered', () => {
    const reports = listPastReports(
      [covered(1, 99), covered(2, 99, { amountCents: 4_000 }), payment(99, '2026-06-14')],
      [WORK],
    )

    expect(reports).toHaveLength(1)
    expect(reports[0]?.count).toBe(2)
    expect(reports[0]?.coveredCents).toBe(14_000)
    expect(reports[0]?.flag?.id).toBe(4)
  })

  it('uses the name you gave the payment', () => {
    // No separate name field: the payment's description is the report's name,
    // and it is already editable.
    const reports = listPastReports([covered(1, 99), payment(99, '2026-06-14')], [WORK])

    expect(reports[0]?.payment.description).toBe('Alicante expenses, September 2026')
  })

  it('lists newest first, like the rest of the app', () => {
    const reports = listPastReports(
      [
        covered(1, 98),
        covered(2, 99),
        payment(98, '2026-05-02'),
        payment(99, '2026-07-11'),
      ],
      [WORK],
    )

    expect(reports.map((r) => r.payment.id)).toEqual([99, 98])
  })

  it('is empty before anything has been reimbursed', () => {
    expect(listPastReports([makeTransaction({ id: 1, flagId: 4 })], [WORK])).toEqual([])
  })

  it('skips a payment that is no longer there', () => {
    // Deleted in another tab before this dataset refreshed. The rows return to
    // the Flagged card on the next load; this must not throw meanwhile.
    const reports = listPastReports([covered(1, 99)], [WORK])

    expect(reports).toEqual([])
  })

  it('subtracts a refund that was part of what the payment covered', () => {
    const reports = listPastReports(
      [
        covered(1, 99, { amountCents: 10_000 }),
        covered(2, 99, { amountCents: 4_000, type: 'refund' }),
        payment(99, '2026-06-14'),
      ],
      [WORK],
    )

    expect(reports[0]?.coveredCents).toBe(6_000)
  })
})

/** A payment carrying the snapshot the settle stamps on it (migration 0021). */
const stamped = (id: number, date: string, count: number, coveredCents: number) =>
  makeTransaction({
    id,
    date,
    description: 'Alicante expenses, September 2026',
    type: 'refund',
    amountCents: 12_000,
    reportCount: count,
    reportCoveredCents: coveredCents,
  })

describe('listPastReports — the recorded figures', () => {
  it('shows what was recorded, not what the rows now come to', () => {
    // The 10,000 row was edited down to 3,000 after the report was sent.
    const reports = listPastReports(
      [covered(1, 99, { amountCents: 3_000 }), stamped(99, '2026-06-14', 1, 10_000)],
      [WORK],
    )

    expect(reports[0]?.count).toBe(1)
    expect(reports[0]?.coveredCents).toBe(10_000)
    expect(reports[0]?.drifted).toBe(true)
  })

  it('does not flag a report whose rows still match', () => {
    const reports = listPastReports([covered(1, 99), stamped(99, '2026-06-14', 1, 10_000)], [WORK])

    expect(reports[0]?.drifted).toBe(false)
    expect(reports[0]?.checkable).toBe(true)
  })

  it('notices a covered row that was deleted or un-settled', () => {
    const reports = listPastReports([covered(1, 99), stamped(99, '2026-06-14', 2, 20_000)], [WORK])

    expect(reports[0]?.count).toBe(2)
    expect(reports[0]?.drifted).toBe(true)
  })

  it('falls back to the live rows for a payment recorded before the snapshot existed', () => {
    const reports = listPastReports([covered(1, 99), payment(99, '2026-06-14')], [WORK])

    expect(reports[0]?.count).toBe(1)
    expect(reports[0]?.coveredCents).toBe(10_000)
    expect(reports[0]?.checkable).toBe(false)
    // Nothing to compare against is not the same as a mismatch.
    expect(reports[0]?.drifted).toBe(false)
  })
})

describe('pastReportDrifted', () => {
  it('is true when the covered rows no longer match the stamp', () => {
    const txns = [covered(1, 99, { amountCents: 3_000 }), stamped(99, '2026-06-14', 1, 10_000)]

    expect(pastReportDrifted(99, txns)).toBe(true)
  })

  it('is false when they match', () => {
    expect(pastReportDrifted(99, [covered(1, 99), stamped(99, '2026-06-14', 1, 10_000)])).toBe(false)
  })

  it('is false for a payment that is not there', () => {
    expect(pastReportDrifted(99, [covered(1, 99)])).toBe(false)
  })
})
