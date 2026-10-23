// @vitest-environment node
/**
 * The rows of a range of months are held to the statement that served them before they were read
 * without per-row joins: that statement's text is kept here as the oracle, run on the same database, and
 * the two answers must match to the byte for every range, every cap and every ledger of a seeded
 * stream, including ledgers built to tie on a date across budget months and to lose their accounts.
 */
import { describe, expect, it } from 'vitest'
import type { MonthRowsRead } from '../../src/domain/data/ledgerParts'
import { shiftBudgetMonth } from '../../src/domain/engine'
import { mulberry32 } from '../../src/domain/engine/rng'
import type { ExpenseDataset, Transaction } from '../../src/domain/types'
import { randomLedger } from '../../src/testing/randomLedger'
import { CAT, VISA } from '../../src/testing/syntheticReference'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { OTHER_OWNER, OWNER, awkwardLedger, queryDb, shifted, type QueryDb } from '../../src/testing/transactionQueryKit'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import { toStoredTxn, type TxnRow } from './rows'
import { COLUMNS, LABEL_IDS_SQL, STATUS_JOINS, STATUS_SQL } from './transactionQuerySql'

const EVERY_ROW = 1_000_000

/** The statement as it was: a bounded id list, joined back to its rows with the account and statement beside each. */
const OLD_SQL = `WITH picked AS (
    SELECT id FROM transactions
    WHERE owner = ? AND budget_month >= ? AND budget_month <= ?
    LIMIT ?)
  SELECT ${COLUMNS}, ${STATUS_SQL} AS status, ${LABEL_IDS_SQL} AS label_ids,
    (SELECT COUNT(*) FROM transaction_attachments r WHERE r.owner = t.owner AND r.transaction_id = t.id) AS receipts
  FROM picked p JOIN transactions t ON t.id = p.id ${STATUS_JOINS}
  ORDER BY t.date DESC, t.id DESC`

interface OldRow extends TxnRow {
  status: Transaction['status']
  label_ids: string
  receipts: number
}

async function oldRead(kit: QueryDb, range: { from: string; to: string }, maxRows: number): Promise<MonthRowsRead | null> {
  const { results } = await kit.d1.prepare(OLD_SQL).bind(OWNER, range.from, range.to, maxRows + 1).all<OldRow>()
  const rows = results ?? []
  if (rows.length > maxRows) return null
  const attachmentCounts: Record<number, number> = {}
  const transactions = rows.map((row) => {
    if (row.receipts > 0) attachmentCounts[row.id] = row.receipts
    const labelIds = row.label_ids === '[]' ? [] : (JSON.parse(row.label_ids) as number[]).sort((a, b) => a - b)
    return { ...toStoredTxn(row), status: row.status, labelIds }
  })
  return { transactions, attachmentCounts }
}

/** The same rows with every date taken from a handful of days, so that dates tie across budget months. */
function tiedLedger(seed: number): ExpenseDataset {
  const rnd = mulberry32(seed + 900)
  const base = randomLedger(seed)
  const days = ['2026-03-31', '2026-04-01', '2026-04-30', '2026-05-01', '2026-05-15']
  const transactions = base.transactions.map((t) => ({ ...t, date: days[Math.floor(rnd() * days.length)]! }))
  return { ...base, transactions }
}

/** The same ledger with its card accounts and a share of its statements gone, as a half-deleted owner has. */
function orphanedLedger(seed: number): ExpenseDataset {
  const rnd = mulberry32(seed + 700)
  const base = randomLedger(seed)
  return {
    ...base,
    accounts: base.accounts.filter((a) => a.settlement === 'immediate' || rnd() < 0.5),
    accountStatements: base.accountStatements.filter(() => rnd() < 0.5),
  }
}

const monthsOf = (rows: readonly Transaction[]): string[] => [...new Set(rows.map((t) => t.budgetMonth))].sort()

/** First to last month of the rows, or any three months when there are none. */
function spanOf(rows: readonly Transaction[]): { from: string; to: string } {
  const months = monthsOf(rows)
  return { from: months[0] ?? '2026-01', to: months.at(-1) ?? '2026-03' }
}

/** Single months, windows of three, the whole span, and ranges before and after any row. */
function rangesOf(rows: readonly Transaction[]): Array<{ from: string; to: string }> {
  const months = monthsOf(rows)
  const { from: first, to: last } = spanOf(rows)
  return [
    ...months.map((m) => ({ from: m, to: m })),
    ...months.map((m) => ({ from: m, to: shiftBudgetMonth(m, 2) })),
    { from: first, to: last },
    { from: shiftBudgetMonth(last, 1), to: shiftBudgetMonth(last, 5) },
    { from: shiftBudgetMonth(first, -9), to: shiftBudgetMonth(first, -1) },
  ]
}

const ledgers: Array<[string, ExpenseDataset]> = [
  ['synthetic', syntheticLedger({ months: 14, perMonth: 30, seed: 5 })],
  ['awkward', awkwardLedger()],
  ...Array.from({ length: 60 }, (_, seed): [string, ExpenseDataset] => [`random ${seed}`, randomLedger(seed)]),
  ...Array.from({ length: 30 }, (_, seed): [string, ExpenseDataset] => [`tied ${seed}`, tiedLedger(seed)]),
  ...Array.from({ length: 30 }, (_, seed): [string, ExpenseDataset] => [`orphaned ${seed}`, orphanedLedger(seed)]),
]

const hasOrphan = (d: ExpenseDataset, test: (t: Transaction) => boolean = () => true): boolean => {
  const known = new Set(d.accounts.map((a) => a.id))
  return d.transactions.some((t) => !known.has(t.accountId) && test(t))
}

describe('the rows of a range of months, against the statement they replaced', () => {
  it('are the same bytes for every range, with no cap in the way', { timeout: 120_000 }, async () => {
    const statuses = new Set<string>()
    let compared = 0
    for (const [name, dataset] of ledgers) {
      const kit = queryDb(dataset)
      const repo = createD1ExpenseRepository({ DB: kit.d1 })
      for (const range of rangesOf(dataset.transactions)) {
        const old = await oldRead(kit, range, EVERY_ROW)
        const now = await repo.readMonthRows(OWNER, range, EVERY_ROW)
        expect(JSON.stringify(now) === JSON.stringify(old), `${name} ${range.from}..${range.to}`).toBe(true)
        for (const t of now?.transactions ?? []) statuses.add(t.status)
        compared += now?.transactions.length ?? 0
      }
    }
    expect([...statuses].sort()).toEqual(['cancelled', 'forecast', 'posted'])
    expect(compared).toBeGreaterThan(30_000)
  })

  it('refuse a range over the cap and serve one at it, as before', async () => {
    let refused = 0
    let served = 0
    for (const [name, dataset] of ledgers.filter((_, i) => i % 3 === 0)) {
      const kit = queryDb(dataset)
      const repo = createD1ExpenseRepository({ DB: kit.d1 })
      const whole = spanOf(dataset.transactions)
      const size = dataset.transactions.length
      for (const cap of [0, 1, 2, size - 1, size, size + 1].filter((c) => c >= 0)) {
        const old = await oldRead(kit, whole, cap)
        const now = await repo.readMonthRows(OWNER, whole, cap)
        expect(JSON.stringify(now) === JSON.stringify(old), `${name} cap ${cap}`).toBe(true)
        if (now === null) refused += 1
        else served += 1
      }
    }
    expect(refused).toBeGreaterThan(20)
    expect(served).toBeGreaterThan(20)
  })

  it('hold the corners the status and the order depend on', () => {
    expect(ledgers.some(([, d]) => d.transactions.some((t) => t.cancelled))).toBe(true)
    expect(ledgers.some(([, d]) => hasOrphan(d))).toBe(true)
    expect(ledgers.some(([, d]) => hasOrphan(d, (t) => t.cancelled))).toBe(true)
    expect(ledgers.some(([, d]) => d.transactions.some((t) => (t.labelIds?.length ?? 0) > 1))).toBe(true)
    expect(ledgers.some(([, d]) => d.attachments.length > 0)).toBe(true)
    const tied = ledgers.filter(([name]) => name.startsWith('tied')).map(([, d]) => Map.groupBy(d.transactions, (t) => t.date))
    expect(tied.some((byDate) => [...byDate.values()].some((rows) => new Set(rows.map((t) => t.budgetMonth)).size > 1))).toBe(true)
  })
})

describe('another owner’s accounts and statements', () => {
  const MONTH = '2030-01'
  const cross = (id: number, accountId: number): Transaction => ({
    id, date: `${MONTH}-10`, budgetMonth: MONTH, description: 'Cross owner', accountId, categoryId: CAT.other,
    type: 'expense', amountCents: 1_000, cancelled: false, status: 'forecast', labelIds: [],
  })

  it('never reach the status of a row, as the join on the owner kept them out before', async () => {
    const base = syntheticLedger({ months: 3, perMonth: 5, seed: 2 })
    const theirCard = shifted(base, 1_000_000).accounts.find((a) => a.settlement === 'deferred')!.id
    const mine = { ...base, transactions: [...base.transactions, cross(900_001, VISA), cross(900_002, theirCard)] }
    const kit = queryDb(mine, [{ owner: OTHER_OWNER, dataset: base }])
    // They have paid this month for the card id this owner also has; this owner has not.
    kit.sqlite.prepare('INSERT INTO account_statements (owner, account_id, year_month, paid) VALUES (?, ?, ?, 1)').run(OTHER_OWNER, VISA, MONTH)
    const range = { from: MONTH, to: MONTH }
    const now = await createD1ExpenseRepository({ DB: kit.d1 }).readMonthRows(OWNER, range, EVERY_ROW)
    const old = await oldRead(kit, range, EVERY_ROW)
    const statusOf = (read: MonthRowsRead | null, id: number) => read?.transactions.find((t) => t.id === id)?.status
    expect([statusOf(now, 900_001), statusOf(now, 900_002)]).toEqual(['forecast', 'posted'])
    expect(JSON.stringify(now) === JSON.stringify(old)).toBe(true)
  })
})
