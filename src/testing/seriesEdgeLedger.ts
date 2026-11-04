/**
 * Rows built to break a series read, one corner each, for tests that hold the server's series to another
 * implementation: runs just under, at and over every size a series treats specially (three rows to be a
 * series, five dates kept, three offsets kept), ties on a date, rows booked out of date order, gaps of
 * zero, across a leap day and a year, budget offsets in both directions, one text spelled as several
 * accounts, categories and types, and rows that must not count (cancelled, plan payments, blanks).
 * Placeholder data only.
 */
import type { ExpenseDataset, Transaction } from '../domain/types'
import { makeDataset, makeTransaction } from './factories'

const pad = (n: number): string => String(n).padStart(2, '0')

interface Plan {
  next: number
  rows: Transaction[]
}

function row(plan: Plan, over: Partial<Transaction>): void {
  const date = over.date ?? '2025-01-10'
  plan.rows.push(
    makeTransaction({ id: plan.next, date, budgetMonth: date.slice(0, 7), createdAt: '2025-01-01T00:00:00Z', ...over }),
  )
  plan.next += 1
}

/** `count` rows of one text a month apart from `startMonth` (2025-01 is 1). */
function monthly(plan: Plan, description: string, count: number, over: Partial<Transaction> = {}, startMonth = 1): void {
  for (let i = 0; i < count; i += 1) {
    const index = startMonth - 1 + i
    const date = `${2025 + Math.floor(index / 12)}-${pad((index % 12) + 1)}-12`
    row(plan, { description, date, ...over })
  }
}

function sizes(plan: Plan): void {
  for (const count of [1, 2, 3, 4, 5, 6, 7, 8, 12]) monthly(plan, `Run of ${count}`, count)
}

function ties(plan: Plan): void {
  // Four rows on one day, then the same day again on another text: newest dates and ids tie.
  for (let i = 0; i < 4; i += 1) row(plan, { description: 'Same day', date: '2025-03-03' })
  for (let i = 0; i < 3; i += 1) row(plan, { description: 'Same day too', date: '2025-03-03' })
  // Booked out of date order: the highest ids are the oldest dates.
  for (const date of ['2025-06-30', '2025-05-30', '2025-04-30', '2025-03-30', '2025-02-28', '2025-01-30', '2024-12-30']) {
    row(plan, { description: 'Back dated', date })
  }
  // A zero gap inside a longer series, and the newest two rows on one date.
  for (const date of ['2025-01-05', '2025-01-05', '2025-02-05', '2025-03-05', '2025-04-05', '2025-05-05', '2025-05-05']) {
    row(plan, { description: 'Zero gap', date })
  }
}

function gaps(plan: Plan): void {
  const clocks = ['2023-12-31', '2024-02-28', '2024-03-01', '2024-03-31', '2024-10-27', '2025-03-30', '2026-01-01']
  for (const date of clocks) row(plan, { description: 'Across a leap day and the clocks', date })
  const yearly = ['2018-01-01', '2019-01-01', '2020-02-29', '2021-03-01', '2022-12-31', '2024-02-29']
  for (const date of yearly) row(plan, { description: 'Yearly leap', date })
}

function offsets(plan: Plan): void {
  const pairs: Array<[string, string]> = [
    ['2024-12-28', '2025-01'], ['2025-01-31', '2025-02'], ['2025-02-27', '2025-02'], ['2025-03-03', '2025-02'],
    ['2025-04-26', '2025-05'], ['2025-05-29', '2025-07'], ['2025-12-30', '2026-01'], ['2026-01-02', '2025-12'],
  ]
  for (const [date, budgetMonth] of pairs) row(plan, { description: 'Budget moves', date, budgetMonth })
  monthly(plan, 'Many months', 30)
}

function split(plan: Plan): void {
  // Two rows each is no series, but four of one text is: grouping on the text alone would make one.
  for (const over of [{ accountId: 1 }, { accountId: 2 }, { categoryId: 2 }, { type: 'income' as const }]) {
    monthly(plan, 'Split text', 2, over)
  }
  // Three on each of two accounts: two series with the same text and label.
  for (const accountId of [1, 2]) monthly(plan, 'Two accounts', 3, { accountId })
  // Spelled differently each time: one series, labelled with the newest row's spelling.
  const spellings = ['Gym ', 'GYM', 'gym', ' Gym']
  spellings.forEach((description, i) => row(plan, { description, date: `2025-0${i + 1}-09`, amountCents: 1_000 + i }))
}

function excluded(plan: Plan): void {
  monthly(plan, 'Cancelled one', 2)
  row(plan, { description: 'Cancelled one', date: '2025-03-12', cancelled: true })
  monthly(plan, 'Cancelled newest', 4)
  row(plan, { description: 'Cancelled newest', date: '2025-09-12', cancelled: true })
  monthly(plan, 'Cancelled all', 4, { cancelled: true })
  monthly(plan, 'Plan payment', 5, { planId: 1 })
  for (let i = 0; i < 5; i += 1) row(plan, { description: i % 2 === 0 ? '' : '  \t ', date: `2025-0${i + 1}-02` })
}

/** Every case above in one ledger, deterministic. */
export function seriesEdgeLedger(): ExpenseDataset {
  const plan: Plan = { next: 1, rows: [] }
  for (const part of [sizes, ties, gaps, offsets, split, excluded]) part(plan)
  const rows = plan.rows
  rows.sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))
  return makeDataset({ transactions: rows })
}
