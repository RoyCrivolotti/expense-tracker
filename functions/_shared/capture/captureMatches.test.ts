import { beforeEach, describe, expect, it } from 'vitest'
import { migratedDatabase, sqliteD1 } from '../../../src/testing/sqliteD1'
import type { CaptureRepository, Recommendation } from '../../../src/domain/ports/captureRepository'
import { createD1CaptureRepository } from '../adapters/d1CaptureRepository'
import { MATCH_CANDIDATES_SQL } from './captureMatchesSql'

const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
const T0 = '2026-11-10T09:00:00.000Z'

let sqlite: ReturnType<typeof migratedDatabase>
let repo: CaptureRepository

beforeEach(async () => {
  sqlite = migratedDatabase()
  repo = createD1CaptureRepository({ DB: sqliteD1(sqlite) })
  await repo.createKey({ keyId: 'k1', owner: ALICE, label: 'Phone', secretHash: 'h1', createdAt: T0 })
  await repo.createKey({ keyId: 'kb', owner: BOB, label: 'Phone', secretHash: 'hb', createdAt: T0 })
  sqlite.exec("INSERT INTO accounts (id, owner, name, kind, settlement, active) VALUES (1, 'alice@example.com', 'Main', 'debit', 'immediate', 1)")
  sqlite.exec("INSERT INTO categories (id, owner, name, monthly_budget_cents, sort_order, active) VALUES (1, 'alice@example.com', 'Food', 0, 1, 1)")
})

interface Typed {
  date?: string
  type?: 'expense' | 'income' | 'investment' | 'refund'
  amountCents?: number
  owner?: string
  cancelled?: number
  description?: string
}

/** A row the person typed. Invented data. */
function typed(o: Typed = {}): number {
  const result = sqlite
    .prepare(
      `INSERT INTO transactions (date, budget_month, description, account_id, category_id, type, amount_cents, cancelled, owner)
       VALUES (?, ?, ?, 1, 1, ?, ?, ?, ?)`,
    )
    .run((o.date ?? '2026-11-10'), (o.date ?? '2026-11-10').slice(0, 7), o.description ?? 'Cafe', o.type ?? 'expense', o.amountCents ?? 1250, o.cancelled ?? 0, o.owner ?? ALICE)
  return Number(result.lastInsertRowid)
}

let n = 0
interface Push {
  key?: string
  amountCents?: number | null
  suggestedType?: 'expense' | 'income' | 'refund' | 'investment' | null
  localDate?: string
  currency?: string | null
}
async function push(o: Push = {}): Promise<string> {
  n += 1
  const ok = await repo.recordCapture(
    {
      id: `e${n}`, keyId: o.key ?? 'k1', source: 'iberia', replayKey: `r${n}`, kind: 'card-purchase', amountCents: -1250, currency: 'EUR',
      merchantRaw: 'CAFE EXAMPLE', last4: '4821', accountDigits: null, occurredAt: T0, localDate: o.localDate ?? '2026-11-10', offsetMinutes: 60, receivedAt: T0, bodyExcerpt: null,
    },
    {
      id: `rec${n}`, accountId: null, amountCents: o.amountCents === undefined ? 1250 : o.amountCents, currency: o.currency === undefined ? 'EUR' : o.currency,
      occurredAt: `${o.localDate ?? '2026-11-10'}T09:41:07+01:00`, localDate: o.localDate ?? '2026-11-10', merchantRaw: 'CAFE EXAMPLE', descriptionSuggested: null,
      suggestedType: o.suggestedType === undefined ? 'expense' : o.suggestedType, createdAt: T0,
    },
  )
  expect(ok).toBe(true)
  return `rec${n}`
}

const matchOf = async (id: string, owner = ALICE): Promise<Recommendation['possibleMatch']> => (await repo.listOpenRecommendations(owner, 50)).find((r) => r.id === id)?.possibleMatch

describe('the typed row a recommendation may duplicate', () => {
  it('is the row of the same price, direction and day, with its id, description and date', async () => {
    const id = await push()
    const row = typed({ description: 'Cafe at the till' })

    expect(await matchOf(id)).toEqual({ transactionId: row, description: 'Cafe at the till', date: '2026-11-10' })
  })

  it('is null when there is no row, and for a payment that cannot be matched', async () => {
    const none = await push()
    const unknownType = await push({ suggestedType: null })
    const noAmount = await push({ amountCents: null })
    const dollars = await push({ currency: 'USD' })
    typed()

    expect(await matchOf(none)).not.toBeNull()
    expect(await matchOf(unknownType)).toBeNull()
    expect(await matchOf(noAmount)).toBeNull()
    expect(await matchOf(dollars)).toBeNull()
  })

  it('stops 14 days back and 3 days forward, on both sides of each edge', async () => {
    const id = await push()
    const early = typed({ date: '2026-10-26' })
    expect(await matchOf(id)).toBeNull()
    sqlite.prepare('UPDATE transactions SET date = ?, budget_month = ? WHERE id = ?').run('2026-10-27', '2026-10', early)
    expect((await matchOf(id))?.transactionId).toBe(early)
    sqlite.prepare('UPDATE transactions SET date = ? WHERE id = ?').run('2026-11-13', early)
    expect((await matchOf(id))?.transactionId).toBe(early)
    sqlite.prepare('UPDATE transactions SET date = ? WHERE id = ?').run('2026-11-14', early)
    expect(await matchOf(id)).toBeNull()
  })

  it('does not match the same price the other way round, a price a cent apart or an old row', async () => {
    const id = await push()
    typed({ type: 'income' })
    typed({ amountCents: 1251 })
    typed({ date: '2026-03-01' })

    expect(await matchOf(id)).toBeNull()
  })

  it('matches an income push with an income or refund row, and an investment taken back out', async () => {
    const id = await push({ suggestedType: 'income' })
    const out = typed({ type: 'expense' })
    expect(await matchOf(id)).toBeNull()
    const back = typed({ type: 'investment', amountCents: -1250 })
    expect((await matchOf(id))?.transactionId).toBe(back)
    sqlite.prepare('DELETE FROM transactions WHERE id = ?').run(back)
    const refund = typed({ type: 'refund' })
    expect((await matchOf(id))?.transactionId).toBe(refund)
    expect(out).not.toBe(refund)
  })

  it('skips a row that was cancelled', async () => {
    const id = await push()
    typed({ cancelled: 1 })

    expect(await matchOf(id)).toBeNull()
  })

  it('skips a row a recommendation already answers for, linked by hand or made by submitting one, so the next push of the same price does not match it', async () => {
    const linked = await push()
    const submitted = await push()
    const next = await push()
    const rowLinked = typed()
    const rowSubmitted = typed()
    await repo.decideRecommendation(ALICE, linked, { state: 'submitted', txnId: rowLinked, at: T0 })
    await repo.decideRecommendation(ALICE, submitted, { state: 'submitted', txnId: rowSubmitted, at: T0 })

    expect(await matchOf(next)).toBeNull()
    const fresh = typed({ description: 'Typed after' })
    expect((await matchOf(next))?.transactionId).toBe(fresh)
  })

  it('skips a row answered for by a dismissed recommendation too, since a dismissed one holds no row', async () => {
    const id = await push()
    const dismissed = await push()
    await repo.decideRecommendation(ALICE, dismissed, { state: 'dismissed', at: T0 })
    const row = typed()

    expect((await matchOf(id))?.transactionId).toBe(row)
  })

  it('never takes another person\'s row, and never gives theirs a match from ours', async () => {
    const mine = await push()
    const theirs = await push({ key: 'kb' })
    typed({ owner: BOB })

    expect(await matchOf(mine)).toBeNull()
    expect((await matchOf(theirs, BOB))?.transactionId).toBeGreaterThan(0)
    const own = typed()
    expect((await matchOf(mine))?.transactionId).toBe(own)
    expect(JSON.stringify(await repo.listOpenRecommendations(ALICE, 50))).not.toContain(BOB)
  })

  it('picks the closest of several by date, and the most recent id on a tie', async () => {
    const id = await push()
    typed({ date: '2026-11-01' })
    const closer = typed({ date: '2026-11-09' })
    expect((await matchOf(id))?.transactionId).toBe(closer)
    const tie = typed({ date: '2026-11-11' })

    expect((await matchOf(id))?.transactionId).toBe(tie)
  })

  it('finds each payment of a page its own row in one read', async () => {
    const a = await push({ amountCents: 1250, localDate: '2026-11-10' })
    const b = await push({ amountCents: 4590, localDate: '2026-11-02' })
    const c = await push({ amountCents: 999, localDate: '2026-11-09' })
    const rowA = typed({ amountCents: 1250, date: '2026-11-09' })
    const rowB = typed({ amountCents: 4590, date: '2026-11-02' })

    expect([(await matchOf(a))?.transactionId, (await matchOf(b))?.transactionId, await matchOf(c)]).toEqual([rowA, rowB, null])
  })

  it('gives one typed row to one payment of a page, the closest, and never offers it twice', async () => {
    const tenth = await push({ localDate: '2026-11-10' })
    const eleventh = await push({ localDate: '2026-11-11' })
    const row = typed({ date: '2026-11-10' })

    expect([(await matchOf(tenth))?.transactionId, await matchOf(eleventh)]).toEqual([row, null])
    const earlier = typed({ date: '2026-11-08' })
    expect((await matchOf(eleventh))?.transactionId).toBe(earlier)
  })

  it('reads the newest rows first, so a cap would drop the oldest', () => {
    const old = typed({ date: '2026-10-27' })
    const newer = typed({ date: '2026-11-10' })
    const sameDay = typed({ date: '2026-11-10' })

    const read = sqlite.prepare(MATCH_CANDIDATES_SQL).all(ALICE, '2026-10-01', '2026-11-30', '[1250]') as Array<{ id: number }>

    expect(read.map((r) => r.id)).toEqual([sameDay, newer, old])
  })
})
