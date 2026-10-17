/**
 * The server's answer for older rows is held to the browser's index: for any prefix, month, limit and
 * locale, the first matches the SQL serves are what `buildDescriptionIndex` returns over the rows booked
 * before that month. The real SQL runs on SQLite with the real migrations; the sorting in JavaScript is the same
 * function the index uses.
 */
import { describe, expect, it } from 'vitest'
import { mergeDescriptionMatches, normalizeDescriptionKey } from '../../src/data/descriptionIndex'
import { MAX_SUGGEST_KEYS, type DescriptionMatch } from '../../src/domain/data/descriptionSuggest'
import { mulberry32 } from '../../src/domain/engine/rng'
import type { ExpenseDataset } from '../../src/domain/types'
import { descriptionDataset, keyed, prefixesFor } from '../../src/testing/descriptionLedger'
import { makeDataset, makeTransaction } from '../../src/testing/factories'
import { inMemoryExpenseRepository } from '../../src/testing/inMemoryExpenseRepository'
import { OTHER_OWNER, OWNER, awkwardLedger, queryDb } from '../../src/testing/transactionQueryKit'
import { unicodeLedger } from '../../src/testing/unicodeLedger'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import { loadDataset } from './db'

const LIMITS = [1, 3, 8, 25]
const BEFORE = [undefined, '2025-06', '2026-01']

function dbFor(ds: ExpenseDataset) {
  const kit = queryDb(ds)
  return { kit, repo: createD1ExpenseRepository({ DB: kit.d1 }) }
}

/** What the browser's index returns over the rows booked before the month `before`, for a typed prefix. */
const reference = (ds: ExpenseDataset, prefix: string, before: string | undefined, limit: number, locale?: string): DescriptionMatch[] =>
  keyed(ds.transactions.filter((t) => before === undefined || t.budgetMonth < before), locale ? { locale } : {}).searchEntries(prefix, limit)

describe('the SQL answers what the browser’s index does over the older rows', () => {
  it('for generated ledgers of accents, capitals, padding and descriptions that sort as equal', async () => {
    let compared = 0
    let found = 0
    for (let seed = 1; seed <= 20; seed += 1) {
      const ds = descriptionDataset(seed)
      const { repo } = dbFor(ds)
      const rnd = mulberry32(seed)
      const prefixes = prefixesFor(ds.transactions, rnd).filter(() => rnd() < 0.3)
      for (const prefix of prefixes) {
        const typed = normalizeDescriptionKey(prefix)
        if (typed === '') continue
        for (const before of BEFORE) {
          for (const limit of LIMITS) {
            const { items: served, tooBroad } = await repo.suggestDescriptions(OWNER, { prefix: typed, limit, ...(before ? { before } : {}) })
            expect(tooBroad).toBe(false)
            expect(served, JSON.stringify({ seed, prefix, before, limit })).toEqual(reference(ds, prefix, before, limit))
            compared += 1
            found += served.length
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(5_000)
    expect(found).toBeGreaterThan(10_000)
  }, 120_000)

  it('for the letters of the unicode ledger and of the paged-read ledger', async () => {
    for (const ds of [unicodeLedger(), awkwardLedger()]) {
      const { repo } = dbFor(ds)
      const rnd = mulberry32(2)
      for (const prefix of prefixesFor(ds.transactions, rnd).concat(['caf', 'café', 'mos', 'мо', 'мос', 'str', 'stras', 'kel', '🍕', 'ist', 'i̇s', 'οδο', 'οδος', 'rent'])) {
        const typed = normalizeDescriptionKey(prefix)
        if (typed === '') continue
        const { items: served } = await repo.suggestDescriptions(OWNER, { prefix: typed, limit: 25 })
        expect(served, prefix).toEqual(reference(ds, prefix, undefined, 25))
      }
    }
  })

  it('for a locale that sorts letters differently', async () => {
    const ds = descriptionDataset(3)
    const { repo } = dbFor(ds)
    let differs = 0
    for (const locale of ['sv', 'es', 'de', 'en']) {
      for (const prefix of ['m', 'mu', 'mü', 'n', 'ñ', 'a', 'ä', 'ar', 'ärl']) {
        const typed = normalizeDescriptionKey(prefix)
        const { items: served } = await repo.suggestDescriptions(OWNER, { prefix: typed, limit: 25, locale })
        expect(served, `${locale} ${prefix}`).toEqual(reference(ds, prefix, undefined, 25, locale))
        if (JSON.stringify(served) !== JSON.stringify(reference(ds, prefix, undefined, 25))) differs += 1
      }
    }
    expect(differs).toBeGreaterThan(0)
  })

  it('and the in-memory repository answers the same as the SQL', async () => {
    const ds = descriptionDataset(5)
    const { kit, repo } = dbFor(ds)
    const memory = inMemoryExpenseRepository(await loadDataset({ DB: kit.d1 }, OWNER), OWNER)
    for (const prefix of ['ca', 'caf', 're', 'ñ', 'mü', 'pi', 'zz']) {
      for (const request of [{ limit: 8 }, { limit: 25, before: '2025-09' }, { limit: 3, locale: 'sv' }]) {
        const typed = normalizeDescriptionKey(prefix)
        expect(await memory.suggestDescriptions(OWNER, { prefix: typed, ...request })).toEqual(
          await repo.suggestDescriptions(OWNER, { prefix: typed, ...request }),
        )
      }
    }
  })
})

describe('merged with the browser’s own matches, the SQL’s answer is the index over every row', () => {
  it('for any month the browser’s rows begin on', async () => {
    let compared = 0
    for (let seed = 1; seed <= 12; seed += 1) {
      const ds = descriptionDataset(seed)
      const { repo } = dbFor(ds)
      const rnd = mulberry32(seed + 100)
      const prefixes = prefixesFor(ds.transactions, rnd).filter(() => rnd() < 0.25)
      const whole = keyed(ds.transactions)
      for (const split of ['2025-05', '2025-11']) {
        const own = keyed(ds.transactions.filter((t) => t.budgetMonth >= split))
        for (const prefix of prefixes) {
          const typed = normalizeDescriptionKey(prefix)
          if (typed === '') continue
          for (const limit of [2, 8]) {
            const { items: older } = await repo.suggestDescriptions(OWNER, { prefix: typed, limit, before: split })
            const merged = mergeDescriptionMatches(own.searchEntries(prefix, limit), older, limit)
            expect(merged, JSON.stringify({ seed, prefix, split, limit })).toEqual(whole.searchEntries(prefix, limit))
            compared += 1
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(1_500)
  }, 120_000)
})

function shops(count: number): ExpenseDataset {
  return makeDataset({
    transactions: Array.from({ length: count }, (_, i) =>
      makeTransaction({ id: i + 1, description: `Shop ${String(i).padStart(4, '0')}`, date: '2025-03-01', createdAt: '2025-03-01T00:00:00Z' }),
    ),
  })
}

describe('the bound on a broad prefix', () => {
  const tooBroad = { items: [], tooBroad: true }

  it(`answers a prefix that matches ${MAX_SUGGEST_KEYS} descriptions and calls one that matches more too broad, as the reference does`, async () => {
    const exactly = dbFor(shops(MAX_SUGGEST_KEYS))
    const answered = await exactly.repo.suggestDescriptions(OWNER, { prefix: 'shop', limit: 8 })
    expect(answered.tooBroad).toBe(false)
    expect(answered.items).toHaveLength(8)
    const over = dbFor(shops(MAX_SUGGEST_KEYS + 1))
    expect(await over.repo.suggestDescriptions(OWNER, { prefix: 'shop', limit: 8 })).toEqual(tooBroad)
    const memory = inMemoryExpenseRepository(await loadDataset({ DB: over.kit.d1 }, OWNER), OWNER)
    expect(await memory.suggestDescriptions(OWNER, { prefix: 'shop', limit: 8 })).toEqual(tooBroad)
    expect((await over.repo.suggestDescriptions(OWNER, { prefix: 'shop 0001', limit: 8 })).items).toHaveLength(1)
  })

  it('counts descriptions, not rows: a thousand rows of one description are one match', async () => {
    const rows = Array.from({ length: 1_000 }, (_, i) =>
      makeTransaction({ id: i + 1, description: 'Same shop', date: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`, createdAt: '2025-01-01T00:00:00Z' }),
    )
    const { repo } = dbFor(makeDataset({ transactions: rows }))
    expect((await repo.suggestDescriptions(OWNER, { prefix: 'same', limit: 8 })).items).toHaveLength(1)
  })

  // The walk takes every description in the range and nothing narrows it, so what it counts is the owner's
  // descriptions starting with the prefix, cancelled or not and in any month, not the ones that would be answered.
  it('counts every description that starts with the prefix, whether or not any of its rows would be answered', async () => {
    const rows = shops(MAX_SUGGEST_KEYS + 1).transactions.map((t, i) =>
      i % 2 === 0 ? { ...t, cancelled: true, status: 'cancelled' as const } : t,
    )
    const ds = makeDataset({ transactions: rows })
    const { kit, repo } = dbFor(ds)
    const memory = inMemoryExpenseRepository(await loadDataset({ DB: kit.d1 }, OWNER), OWNER)
    for (const request of [{ limit: 8 }, { limit: 8, before: '2025-03' }, { limit: 8, before: '2025-04' }]) {
      expect(await repo.suggestDescriptions(OWNER, { prefix: 'shop', ...request })).toEqual(tooBroad)
      expect(await memory.suggestDescriptions(OWNER, { prefix: 'shop', ...request })).toEqual(tooBroad)
    }
    // Typing more narrows the walk, and then only the eligible ones are answered.
    const narrower = await repo.suggestDescriptions(OWNER, { prefix: 'shop 00', limit: 25 })
    expect(narrower.items.length).toBeGreaterThan(0)
    expect(narrower).toEqual(await memory.suggestDescriptions(OWNER, { prefix: 'shop 00', limit: 25 }))
  })
})

describe('the rows it reads', () => {
  it('are the owner’s only: another owner’s descriptions, newer or not, never appear', async () => {
    const mine = makeDataset({ transactions: [makeTransaction({ id: 1, description: 'Rent flat', date: '2025-01-01', createdAt: '2025-01-01T00:00:00Z' })] })
    const theirs = makeDataset({ transactions: [makeTransaction({ id: 1, description: 'Rent castle', date: '2026-01-01', createdAt: '2025-01-01T00:00:00Z' })] })
    const kit = queryDb(mine, [{ owner: OTHER_OWNER, dataset: theirs }])
    const repo = createD1ExpenseRepository({ DB: kit.d1 })
    expect((await repo.suggestDescriptions(OWNER, { prefix: 'rent', limit: 8 })).items.map((m) => m.label)).toEqual(['Rent flat'])
    expect((await repo.suggestDescriptions(OTHER_OWNER, { prefix: 'rent', limit: 8 })).items.map((m) => m.label)).toEqual(['Rent castle'])
  })

  it('leave out cancelled rows, blank descriptions, and a month on or after `before`', async () => {
    const row = (id: number, over: object) => makeTransaction({ id, description: 'Gym', date: '2025-02-01', budgetMonth: '2025-02', createdAt: '2025-01-01T00:00:00Z', ...over })
    const ds = makeDataset({ transactions: [row(1, {}), row(2, { cancelled: true, date: '2025-03-01', budgetMonth: '2025-03', description: 'Gym plus' }), row(3, { description: '   ' }), row(4, { date: '2025-04-01', budgetMonth: '2025-04', description: 'Gym later' })] })
    const { repo } = dbFor(ds)
    const labels = async (before?: string) => (await repo.suggestDescriptions(OWNER, { prefix: 'gy', limit: 8, ...(before ? { before } : {}) })).items.map((m) => m.label)
    expect(await labels()).toEqual(['Gym', 'Gym later'])
    expect(await labels('2025-04')).toEqual(['Gym'])
    expect(await labels('2025-02')).toEqual([])
  })

  it('cut at the budget month and not at the date, which is what the browser holds its rows by', async () => {
    // A row dated in January that is booked to February, and one dated in February that is booked to January.
    const ds = makeDataset({
      transactions: [
        makeTransaction({ id: 1, description: 'Early charge', date: '2025-01-31', budgetMonth: '2025-02', createdAt: '2025-01-01T00:00:00Z' }),
        makeTransaction({ id: 2, description: 'Late charge', date: '2025-02-01', budgetMonth: '2025-01', createdAt: '2025-01-01T00:00:00Z' }),
      ],
    })
    const { kit, repo } = dbFor(ds)
    const memory = inMemoryExpenseRepository(await loadDataset({ DB: kit.d1 }, OWNER), OWNER)
    for (const store of [repo, memory]) {
      const older = await store.suggestDescriptions(OWNER, { prefix: 'e', limit: 8, before: '2025-02' })
      const labels = async (prefix: string) => (await store.suggestDescriptions(OWNER, { prefix, limit: 8, before: '2025-02' })).items.map((m) => m.label)
      expect(older.items).toEqual([])
      expect(await labels('late')).toEqual(['Late charge'])
    }
  })

  it('give a description whose rows are all in the browser’s months no match', async () => {
    const ds = makeDataset({ transactions: [makeTransaction({ id: 1, description: 'Only recent', date: '2026-03-01', budgetMonth: '2026-03', createdAt: '2026-03-01T00:00:00Z' })] })
    const { repo } = dbFor(ds)
    expect(await repo.suggestDescriptions(OWNER, { prefix: 'only', limit: 8, before: '2026-01' })).toEqual({ items: [], tooBroad: false })
  })

  it('answer 503 while rows are waiting for their normalized description, and then answer', async () => {
    const ds = shops(2_200)
    const kit = queryDb(ds, [], { descriptionNorm: false })
    const repo = createD1ExpenseRepository({ DB: kit.d1 })
    await expect(repo.suggestDescriptions(OWNER, { prefix: 'sh', limit: 8 })).rejects.toMatchObject({ status: 503 })
    expect((await repo.suggestDescriptions(OWNER, { prefix: 'shop 0007', limit: 8 })).items).toHaveLength(1)
  })
})
