/**
 * The paged SQL reads are held to the engine: for any filter, the pages put end to end are what
 * `filterTransactions` returns over the dataset the API serves, in the same order, and the summary is
 * what the pure functions compute. Everything here runs the real SQL on SQLite with the real
 * migrations; the reference is `loadDataset`, so the derived status and label ids come from the same
 * place a client gets them.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { SUMMARY_COUNT_CAP } from '../../src/domain/data/transactionQuery'
import { filterTransactions, netSpendCents, type TxnFilter } from '../../src/domain/engine/transactions'
import type { Transaction } from '../../src/domain/types'
import type { ExpenseRepository } from '../../src/domain/ports/expenseRepository'
import { inMemoryExpenseRepository } from '../../src/testing/inMemoryExpenseRepository'
import {
  OWNER,
  allPages,
  awkwardLedger,
  filterStream,
  queryDb,
  vocabularyOf,
  withSortedLabels,
  type QueryDb,
} from '../../src/testing/transactionQueryKit'
import { loadDataset } from './db'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import type { Env } from './env'

/** Hundreds of queries each; the default five seconds is too tight on a busy CI runner. */
const SLOW = 60_000

let kit: QueryDb
let repo: ExpenseRepository
let all: Transaction[]
let filters: TxnFilter[]

beforeAll(async () => {
  const ledger = awkwardLedger()
  kit = queryDb(ledger)
  const env: Env = { DB: kit.d1 }
  repo = createD1ExpenseRepository(env)
  all = (await loadDataset(env, OWNER)).transactions
  filters = filterStream(vocabularyOf(ledger), 250, 20261017)
})

const expected = (filter: TxnFilter): Transaction[] =>
  filterTransactions(all, filter).map(withSortedLabels)

const pagesOf = async (filter: TxnFilter, limit: number): Promise<Transaction[]> =>
  (await allPages(repo, OWNER, filter, limit)).map(withSortedLabels)

/** Page sizes worth trying for a result of `n` rows, including one that divides it exactly. */
function limitsFor(n: number): number[] {
  const divisor = [2, 3, 4, 5, 7].find((d) => n >= d && n % d === 0)
  const limits = [7, 50, 200, n, n - 1, divisor ? n / divisor : 0]
  if (n <= 60) limits.push(1)
  return [...new Set(limits.filter((l) => l >= 1 && l <= 200))]
}

describe('the test ledger', () => {
  it('is big enough, and holds the cases the SQL has to get right', () => {
    expect(all.length).toBeGreaterThan(2_500)
    expect(new Set(all.map((t) => t.status))).toEqual(new Set(['posted', 'forecast', 'cancelled']))
    expect(all.filter((t) => t.date === '2026-05-15').length).toBeGreaterThan(40)
    expect(all.some((t) => t.type === 'investment' && t.amountCents < 0)).toBe(true)
    const orphan = all.find((t) => t.description === 'Orphan account cancelled')
    expect(orphan?.status).toBe('posted')
  })
})

describe('pages put end to end equal filterTransactions', () => {
  it('for 250 random filters at several page sizes', async () => {
    const empty: string[] = []
    let withRows = 0
    for (const filter of filters) {
      const want = expected(filter)
      if (want.length > 0) withRows += 1
      else empty.push(JSON.stringify(filter))
      for (const limit of limitsFor(want.length)) {
        const got = await pagesOf(filter, limit)
        expect(got.map((t) => t.id), `${JSON.stringify(filter)} at ${limit}`).toEqual(want.map((t) => t.id))
        expect(got).toEqual(want)
      }
    }
    expect(withRows).toBeGreaterThan(140)
    expect(empty.length).toBeGreaterThan(5)
  }, SLOW)

  it('with no filter at all, at page size 1 over a stretch and 200 over everything', async () => {
    const want = expected({})
    expect(await pagesOf({}, 200)).toEqual(want)
    const first = await repo.queryTransactions(OWNER, {}, { limit: 1 })
    expect(first.items.map((t) => t.id)).toEqual([want[0]?.id])
    expect(first.hasMore).toBe(true)
  })

  it('on an exact multiple of the page size, ends without an extra empty page', async () => {
    const filter: TxnFilter = { dateFrom: '2026-05-15', dateTo: '2026-05-15' }
    const want = expected(filter)
    expect(want.length).toBeGreaterThanOrEqual(45)
    const size = want.length / 3
    const pages: number[] = []
    let after: { date: string; id: number } | undefined
    for (let i = 0; i < 10; i += 1) {
      const page = await repo.queryTransactions(OWNER, filter, after ? { limit: size, after } : { limit: size })
      pages.push(page.items.length)
      const last = page.items.at(-1)
      if (!page.hasMore || !last) break
      after = { date: last.date, id: last.id }
    }
    expect(pages).toEqual([size, size, size])
  })

  it('tells the last page from a full one', async () => {
    const filter: TxnFilter = { dateFrom: '2026-05-15', dateTo: '2026-05-15' }
    const n = expected(filter).length
    expect((await repo.queryTransactions(OWNER, filter, { limit: n })).hasMore).toBe(false)
    expect((await repo.queryTransactions(OWNER, filter, { limit: n - 1 })).hasMore).toBe(true)
    expect(await repo.queryTransactions(OWNER, { query: 'no such text anywhere' }, { limit: 10 })).toEqual({
      items: [],
      hasMore: false,
    })
  })

  it('returns the row the dataset returns, key for key', async () => {
    const page = await repo.queryTransactions(OWNER, { month: '2026-03' }, { limit: 200 })
    const byId = new Map(all.map((t) => [t.id, t]))
    expect(page.items.length).toBeGreaterThan(50)
    for (const item of page.items) expect(withSortedLabels(item)).toEqual(withSortedLabels(byId.get(item.id) as Transaction))
  })
})

describe('text search', () => {
  const search = async (query: string): Promise<string[]> =>
    (await pagesOf({ query }, 200)).map((t) => t.description)

  it('ignores case, including accents and non-Latin letters', async () => {
    expect(await search('café')).toEqual(expect.arrayContaining(['CAFÉ ÑANDÚ', 'café con leche']))
    expect(await search('CAFÉ')).toEqual(await search('café'))
    expect(await search('éclair')).toContain('ÉCLAIR aux fraises')
    expect(await search('москва')).toEqual(expect.arrayContaining(['Москва кафе', 'МОСКВА']))
    expect(await search('Ñandú')).toContain('CAFÉ ÑANDÚ')
  })

  it('takes % and _ literally', async () => {
    expect(await search('100%')).toEqual(['100% juice'])
    expect(await search('a_b')).toEqual(['a_b'])
    expect(await search('%')).toEqual(['100% juice'])
    expect(await search('_')).toContain('a_b')
    expect(await search('_')).not.toContain('aXb')
  })

  it('searches description and notes joined by one space', async () => {
    expect(await search('needle-in')).toEqual(['Plain'])
    expect(await search('plain needle')).toEqual(['Plain'])
    expect(await search('reunión áéí')).toEqual(['CAFÉ ÑANDÚ'])
    expect(await search('ñandú reunión')).toEqual(['CAFÉ ÑANDÚ'])
    // A row with no notes still has the joining space after its description.
    const trailing = await pagesOf({ query: 'plain ' }, 200)
    expect(trailing.map((t) => t.id)).toEqual(expected({ query: 'plain ' }).map((t) => t.id))
    expect(trailing.length).toBeGreaterThan(1)
  })

  it('also keeps a row whose amount is in the range the text reads as', async () => {
    const filter: TxnFilter = { query: 'a_b', queryAmount: { fromCents: 6_450, toCents: 6_450 } }
    const got = await pagesOf(filter, 200)
    expect(got.map((t) => t.description).sort()).toEqual(['aXb', 'a_b'])
    expect(got.map((t) => t.id)).toEqual(expected(filter).map((t) => t.id))
    // Without text the range has nothing to attach to, as in the engine.
    const alone: TxnFilter = { queryAmount: { fromCents: 6_450, toCents: 6_450 } }
    expect((await pagesOf(alone, 200)).length).toBe(all.length)
  })
})

describe('amount bounds', () => {
  it('compare the size of the amount, so a withdrawal counts by its absolute value', async () => {
    const filter: TxnFilter = { type: 'investment', amountMinCents: 100_000 }
    const got = await pagesOf(filter, 200)
    expect(got.every((t) => t.amountCents < 0 || t.amountCents >= 100_000)).toBe(true)
    expect(got.some((t) => t.amountCents === -250_000)).toBe(true)
    expect(got.map((t) => t.id)).toEqual(expected(filter).map((t) => t.id))
    const small = await pagesOf({ type: 'investment', amountMaxCents: 5_000 }, 200)
    expect(small.some((t) => t.amountCents === -5_000)).toBe(true)
    expect(small.some((t) => t.amountCents === -250_000)).toBe(false)
  })

  it('include both ends', async () => {
    const both: TxnFilter = { amountMinCents: 6_400, amountMaxCents: 6_499 }
    const got = await pagesOf(both, 200)
    expect(got.map((t) => t.amountCents).every((c) => c >= 6_400 && c <= 6_499)).toBe(true)
    expect(got.map((t) => t.id)).toEqual(expected(both).map((t) => t.id))
  })
})

describe('status', () => {
  it('is derived the way the dataset derives it, including for a row whose account is missing', async () => {
    for (const status of ['posted', 'forecast', 'cancelled'] as const) {
      const got = await pagesOf({ status }, 200)
      expect(got.length).toBeGreaterThan(0)
      expect(got.every((t) => t.status === status)).toBe(true)
      expect(got.map((t) => t.id)).toEqual(expected({ status }).map((t) => t.id))
    }
    const posted = await pagesOf({ status: 'posted', accountId: 99 }, 200)
    expect(posted.map((t) => t.description).sort()).toEqual(['Orphan account', 'Orphan account cancelled'])
  })
})

describe('labels and flags', () => {
  it('keeps a row carrying any one of the labels, and none for a label that does not exist', async () => {
    for (const labelIds of [[1], [3], [1, 3], [2, 3], [99], [1, 2, 3]]) {
      const got = await pagesOf({ labelIds }, 200)
      expect(got.map((t) => t.id)).toEqual(expected({ labelIds }).map((t) => t.id))
    }
    expect(await pagesOf({ labelIds: [99] }, 200)).toEqual([])
    expect((await pagesOf({ labelIds: [] }, 200)).length).toBe(all.length)
  })

  it('lists label ids in ascending order, without those whose label is gone', async () => {
    const odd = all.find((t) => t.description === 'Labelled out of order')
    expect((await repo.getTransaction(OWNER, odd?.id ?? 0))?.labelIds).toEqual([1, 3])
    const dangling = all.find((t) => t.description === 'Dangling label')
    expect(dangling?.labelIds).toEqual([2])
    expect((await repo.getTransaction(OWNER, dangling?.id ?? 0))?.labelIds).toEqual([2])
  })

  it('narrows to a flag, or to rows with none', async () => {
    for (const flagId of [1, 2, 'none'] as const) {
      expect((await pagesOf({ flagId }, 200)).map((t) => t.id)).toEqual(expected({ flagId }).map((t) => t.id))
    }
  })
})

describe('summary', () => {
  it('matches the pure functions for every random filter', async () => {
    for (const filter of filters) {
      const matching = filterTransactions(all, filter)
      const summary = await repo.summarizeTransactions(OWNER, filter)
      expect(summary, JSON.stringify(filter)).toEqual({
        count: Math.min(matching.length, SUMMARY_COUNT_CAP),
        capped: matching.length > SUMMARY_COUNT_CAP,
        netSpendCents: netSpendCents(matching),
      })
    }
  }, SLOW)

  it('stops counting at the cap but still sums every row', async () => {
    const summary = await repo.summarizeTransactions(OWNER, {})
    expect(all.length).toBeGreaterThan(SUMMARY_COUNT_CAP)
    expect(summary).toEqual({ count: SUMMARY_COUNT_CAP, capped: true, netSpendCents: netSpendCents(all) })
  })

  it('leaves income and investments out, takes refunds off, and keeps cancelled and forecast rows in', async () => {
    const summary = await repo.summarizeTransactions(OWNER, { dateFrom: '2026-05-15', dateTo: '2026-05-15' })
    const day = all.filter((t) => t.date === '2026-05-15')
    expect(summary.netSpendCents).toBe(netSpendCents(day))
    const types = await repo.summarizeTransactions(OWNER, { type: 'investment' })
    expect(types.netSpendCents).toBe(0)
    const refunds = await repo.summarizeTransactions(OWNER, { type: 'refund' })
    expect(refunds.netSpendCents).toBeLessThan(0)
    const cancelled = await repo.summarizeTransactions(OWNER, { status: 'cancelled' })
    expect(cancelled.netSpendCents).toBe(netSpendCents(all.filter((t) => t.status === 'cancelled')))
  })

  it('is zero for nothing', async () => {
    expect(await repo.summarizeTransactions(OWNER, { query: 'no such text anywhere' })).toEqual({
      count: 0,
      capped: false,
      netSpendCents: 0,
    })
  })
})

describe('the in-memory repository answers the same as the SQL', () => {
  it('on every random filter, page by page', async () => {
    const memory = inMemoryExpenseRepository(await dataset(), OWNER)
    for (const filter of filters.slice(0, 80)) {
      for (const limit of [13, 200]) {
        const fromMemory = (await allPages(memory, OWNER, filter, limit)).map(withSortedLabels)
        expect(fromMemory.map((t) => t.id)).toEqual((await pagesOf(filter, limit)).map((t) => t.id))
      }
      expect(await memory.summarizeTransactions(OWNER, filter)).toEqual(
        await repo.summarizeTransactions(OWNER, filter),
      )
    }
  }, SLOW)

  it('and for one row by id', async () => {
    const memory = inMemoryExpenseRepository(await dataset(), OWNER)
    const some = all.slice(0, 40)
    for (const t of some) {
      expect(withSortedLabels((await memory.getTransaction(OWNER, t.id)) as Transaction)).toEqual(
        withSortedLabels((await repo.getTransaction(OWNER, t.id)) as Transaction),
      )
    }
    expect(await memory.getTransaction(OWNER, 999_999)).toBeNull()
  })
})

/** The served dataset as a seed for the in-memory repository, which keeps label links apart. */
async function dataset() {
  const served = await loadDataset({ DB: kit.d1 }, OWNER)
  const transactionLabels = served.transactions.flatMap((t) =>
    (t.labelIds ?? []).map((labelId) => ({ transactionId: t.id, labelId })),
  )
  return { ...served, transactionLabels }
}
