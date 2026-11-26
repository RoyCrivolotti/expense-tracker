import { beforeEach, describe, expect, it } from 'vitest'
import { migratedDatabase, newStats, sqliteD1, type SqliteD1Stats } from '../../../src/testing/sqliteD1'
import type { CaptureRepository } from '../../../src/domain/ports/captureRepository'
import type { Slot } from '../../../src/domain/capture'
import { createD1CaptureRepository } from '../adapters/d1CaptureRepository'
import { withSuggestions } from '../adapters/d1CaptureSuggestions'

const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
const T0 = '2026-11-10T09:00:00.000Z'
const SLOTS: Slot[] = [
  {
    kind: 'number',
    index: 2,
    raw: '12,50',
    candidates: [{ cents: 1250, mark: 'comma' }],
    currency: 'EUR',
    negative: false,
  },
]

let sqlite: ReturnType<typeof migratedDatabase>
let stats: SqliteD1Stats
let repo: CaptureRepository

beforeEach(async () => {
  sqlite = migratedDatabase()
  stats = newStats()
  repo = createD1CaptureRepository({ DB: sqliteD1(sqlite, stats) })
  await repo.createKey({ keyId: 'k1', owner: ALICE, label: 'Phone', secretHash: 'h1', createdAt: T0 })
  await repo.createKey({ keyId: 'kb', owner: BOB, label: 'Phone', secretHash: 'hb', createdAt: T0 })
})

let n = 0
interface Push {
  key?: string
  merchant?: string
  amountCents?: number
  template?: string
  slots?: Slot[]
  localDate?: string
  body?: string | null
}

/** One stored push and its recommendation. Invented data. */
async function push(o: Push = {}): Promise<string> {
  n += 1
  const merchant = o.merchant ?? 'CAFE EXAMPLE'
  const templateId = o.template ?? 't1'
  const exists = sqlite.prepare('SELECT 1 FROM capture_templates WHERE template_id = ?').get(templateId)
  const template = exists
    ? ({ kind: 'existing', templateId } as const)
    : ({ kind: 'new', template: { templateId, title: 'compra', skeleton: `compra ${templateId}` } } as const)
  const localDate = o.localDate ?? '2026-11-10'
  const ok = await repo.recordCapture(
    {
      id: `e${n}`,
      keyId: o.key ?? 'k1',
      source: 'iberia',
      replayKey: `r${n}`,
      kind: 'push',
      amountCents: 1250,
      currency: 'EUR',
      merchantRaw: merchant,
      last4: null,
      accountDigits: null,
      shapeId: 'one-wording',
      occurredAt: T0,
      localDate,
      offsetMinutes: 60,
      receivedAt: T0,
      body: o.body ?? null,
      slots: JSON.stringify(o.slots ?? SLOTS),
    },
    {
      id: `rec${String(n).padStart(4, '0')}`,
      accountId: null,
      amountCents: o.amountCents ?? 1250,
      currency: 'EUR',
      occurredAt: `${localDate}T09:41:07+01:00`,
      localDate,
      merchantRaw: merchant,
      descriptionSuggested: null,
      suggestedType: 'expense',
      createdAt: T0,
    },
    undefined,
    template,
  )
  expect(ok).toBe('created')
  return `rec${String(n).padStart(4, '0')}`
}

const learn = (
  template: string,
  set: string,
) => sqlite.prepare(`UPDATE capture_templates SET ${set} WHERE template_id = ?`).run(template)

function remember(
  key: string,
  description: string,
  votes: number,
  amountCents = -1,
  owner = ALICE,
  categoryId: number | null = 7,
) {
  sqlite
    .prepare(
      'INSERT INTO capture_merchants (owner, key, amount_cents, description, category_id, votes, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(owner, key, amountCents, description, categoryId, votes, T0)
}

const suggestionOf = async (
  id: string,
  owner = ALICE,
) => (await repo.listOpenRecommendations(owner, 50)).find((r) => r.id === id)?.suggestion

const namedOf = async (id: string) => (await repo.listOpenRecommendations(ALICE, 50)).find((r) => r.id === id)?.named

const messageOf = async (
  id: string,
  owner = ALICE,
) => (await repo.listOpenRecommendations(owner, 50)).find((r) => r.id === id)?.message

describe('the suggestion on the list', () => {
  it('carries the person’s description and category for the merchant and the template’s type and account', async () => {
    const id = await push()
    learn('t1', "accepts = 2, type = 'refund', account_id = 3")
    remember('cafe example', 'Coffee', 2)

    expect(await suggestionOf(id)).toEqual({
      description: 'Coffee',
      categoryId: 7,
      type: 'refund',
      accountId: 3,
      amountCents: 1250,
      sightings: 2,
      settled: true,
      reasons: [],
    })
  })

  it('prefers the rows at the payment’s price', async () => {
    const id = await push()
    learn('t1', 'accepts = 1')
    remember('cafe example', 'Coffee', 5)
    remember('cafe example', 'Cake', 1, 1250)

    expect(await suggestionOf(id)).toMatchObject({ description: 'Cake', sightings: 1, settled: false })
  })

  it('says a wording never accepted is new, and suggests no description with no history', async () => {
    const id = await push()

    expect(await suggestionOf(id)).toMatchObject({ description: null, sightings: 0, reasons: ['new-shape'] })
  })

  it('treats a push whose template was evicted as a new wording', async () => {
    const id = await push()
    sqlite.prepare('DELETE FROM capture_templates').run()

    expect((await suggestionOf(id))?.reasons).toEqual(['new-shape'])
  })

  it('is null for a recommendation no push made', async () => {
    await repo.createRecommendation({
      id: 'rec-alone',
      owner: ALICE,
      accountId: null,
      amountCents: 100,
      currency: 'EUR',
      occurredAt: '2026-11-10T09:00:00+01:00',
      localDate: '2026-11-10',
      merchantRaw: 'CAFE EXAMPLE',
      descriptionSuggested: null,
      suggestedType: 'expense',
      createdAt: T0,
    })

    expect(await suggestionOf('rec-alone')).toBeNull()
    expect(await messageOf('rec-alone')).toBeNull()
    expect(await namedOf('rec-alone')).toBe(true)
  })

  it('carries the text of the push that made it, to its owner only, and null once the text is blanked', async () => {
    const body = 'Card used: 12,50 EUR, CAFE EXAMPLE'
    const id = await push({ body })
    const blanked = await push({ body: null })

    expect(await messageOf(id)).toBe(body)
    expect(await messageOf(blanked)).toBeNull()
    expect(await messageOf(id, BOB)).toBeUndefined()
    // The read itself is the person's own: asked for another person's payment by its id, it finds no push at all.
    const db = sqliteD1(sqlite, stats)
    const page = (await repo.listOpenRecommendations(ALICE, 50)).filter((r) => r.id === id)
    expect((await withSuggestions(db, ALICE, page))[0]!.message).toBe(body)
    expect((await withSuggestions(db, BOB, page))[0]).toMatchObject({ message: null, suggestion: null })
  })

  it.each([
    'Example Bank alert: 43,80 EUR today',
    'A shop took 12,50€ just now',
    'You paid $18.20 at a shop',
    'Approved, 1.250,00 EUR in all',
    'EUR 9,99 booked this morning',
    'Your operation went through without any problem and you can now look it up in the list of the app',
  ])('says a whole message is not a name, whatever its wording: %s', async (merchant) => {
    expect(await namedOf(await push({ merchant }))).toBe(false)
  })

  it.each(['CAFE EXAMPLE 0042', 'MERCADO EJEMPLO', 'BAR 33 EJEMPLO'])(
    'says a merchant is a name: %s',
    async (merchant) => {
      expect(await namedOf(await push({ merchant }))).toBe(true)
    },
  )

  it('suggests nothing from a whole push, which is not a merchant', async () => {
    const id = await push({ merchant: 'Has pagado 12,50 EUR en CAFE EXAMPLE' })
    remember('has pagado en cafe example', 'Coffee', 3)

    expect((await suggestionOf(id))?.description).toBeNull()
  })

  it('never reads another person’s merchants or templates', async () => {
    const id = await push()
    await push({ key: 'kb', template: 't-bob' })
    learn('t-bob', "accepts = 5, type = 'income'")
    remember('cafe example', 'Their coffee', 9, -1, BOB)

    expect(await suggestionOf(id)).toMatchObject({ description: null, type: 'expense', reasons: ['new-shape'] })
  })

  it('looks for a typed duplicate at the re-read amount, not the first reading', async () => {
    const slots: Slot[] = [
      ...SLOTS,
      {
        kind: 'number',
        index: 6,
        raw: '1.234',
        candidates: [
          { cents: 123400, mark: 'comma' },
          { cents: 123, mark: 'dot', ambiguous: true },
        ],
        currency: 'EUR',
        negative: false,
      },
    ]
    const id = await push({ slots })
    learn('t1', "accepts = 1, amount_slot = 6, amount_mark = 'dot'")
    sqlite.exec(
      "INSERT INTO accounts (id, owner, name, kind, settlement, active) VALUES (1, 'alice@example.com', 'Main', 'debit', 'immediate', 1)",
    )
    sqlite.exec(
      "INSERT INTO categories (id, owner, name, monthly_budget_cents, sort_order, active) VALUES (1, 'alice@example.com', 'Food', 0, 1, 1)",
    )
    sqlite.exec(
      "INSERT INTO transactions (date, budget_month, description, account_id, category_id, type, amount_cents, cancelled, owner) VALUES ('2026-11-10', '2026-11', 'Parking', 1, 1, 'expense', 123, 0, 'alice@example.com')",
    )

    const [rec] = await repo.listOpenRecommendations(ALICE, 50)
    expect(rec?.id).toBe(id)
    expect(rec?.amountCents).toBe(1250)
    expect(rec?.suggestion).toMatchObject({ amountCents: 123, reasons: ['amount-relearned'] })
    expect(rec?.possibleMatch).toMatchObject({ description: 'Parking' })
  })

  it('suggests for a page of 101 in two reads, whatever the page holds', async () => {
    for (let i = 0; i < 101; i++)
      await push({
        merchant: `SHOP ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`,
      })
    learn('t1', 'accepts = 1')
    remember('shop aa', 'First shop', 2)
    remember('shop wd', 'Last shop', 2)
    const before = stats.statements

    const page = await repo.listOpenRecommendations(ALICE, 101)

    expect(page).toHaveLength(101)
    expect(page.every((r) => r.suggestion !== null && r.suggestion !== undefined)).toBe(true)
    expect(
      page
        .map((r) => r.suggestion?.description)
        .filter(Boolean)
        .sort(),
    ).toEqual(['First shop', 'Last shop'])
    // The page, the cards, the two suggestion reads and the duplicate candidates.
    expect(stats.statements - before).toBe(5)
  })
})
