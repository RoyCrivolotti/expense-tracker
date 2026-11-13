import { beforeEach, describe, expect, it } from 'vitest'
import { migratedDatabase, sqliteD1 } from '../../../src/testing/sqliteD1'
import { MAX_CAPTURE_CARDS, type CaptureCard, type CaptureRepository } from '../../../src/domain/ports/captureRepository'
import { createD1CaptureRepository } from '../adapters/d1CaptureRepository'

const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
const T0 = '2026-03-02T09:00:00.000Z'

let sqlite: ReturnType<typeof migratedDatabase>
let repo: CaptureRepository

const account = (id: number, owner = ALICE) =>
  sqlite.prepare("INSERT INTO accounts (id, owner, name, kind, settlement, active) VALUES (?, ?, 'Account', 'debit', 'immediate', 1)").run(id, owner)

beforeEach(async () => {
  sqlite = migratedDatabase()
  repo = createD1CaptureRepository({ DB: sqliteD1(sqlite) })
  await repo.createKey({ keyId: 'k1', owner: ALICE, label: 'Phone', secretHash: 'h1', createdAt: T0 })
  await repo.createKey({ keyId: 'kb', owner: BOB, label: 'Phone', secretHash: 'hb', createdAt: T0 })
  account(1)
  account(2)
  account(9, BOB)
})

const card = (over: Partial<CaptureCard> = {}): CaptureCard => ({ source: 'iberia', digitsKind: 'card', digits: '4821', accountId: 1, ...over })

let n = 0
/** A push from a card, left as an open recommendation under its key's owner. Invented digits only. */
async function push(opts: { digits?: string | null; key?: string; source?: 'iberia' | 'santander'; accountId?: number | null } = {}) {
  n += 1
  const key = opts.key ?? 'k1'
  const ok = await repo.recordCapture(
    {
      id: `e${n}`,
      keyId: key,
      source: opts.source ?? 'iberia',
      replayKey: `r${n}`,
      kind: 'card-purchase',
      amountCents: -1250,
      currency: 'EUR',
      merchantRaw: 'CAFE EXAMPLE',
      last4: opts.digits === undefined ? '4821' : opts.digits,
      accountDigits: null,
      occurredAt: '2026-03-02T08:59:00.000Z',
      localDate: '2026-03-02',
      offsetMinutes: 60,
      receivedAt: T0,
      bodyExcerpt: null,
    },
    {
      id: `rec${n}`,
      accountId: opts.accountId ?? null,
      amountCents: 1250,
      currency: 'EUR',
      occurredAt: '2026-03-02T08:59:00.000+01:00',
      localDate: '2026-03-02',
      merchantRaw: 'CAFE EXAMPLE',
      descriptionSuggested: null,
      suggestedType: 'expense',
      createdAt: T0,
    },
  )
  expect(ok).toBe(true)
  return `rec${n}`
}

const accountOf = async (owner: string, id: string) => (await repo.getRecommendation(owner, id))?.accountId

describe('linking a card', () => {
  it('stores the link for an account of the owner', async () => {
    expect(await repo.linkCard(ALICE, card())).toBe('linked')

    expect(await repo.listCards(ALICE)).toEqual([card()])
  })

  it("refuses another person's account and a missing one, and stores nothing", async () => {
    expect(await repo.linkCard(ALICE, card({ accountId: 9 }))).toBe('no-account')
    expect(await repo.linkCard(ALICE, card({ accountId: 404 }))).toBe('no-account')

    expect(await repo.listCards(ALICE)).toEqual([])
  })

  it('is idempotent: saving the same link twice leaves one row', async () => {
    expect(await repo.linkCard(ALICE, card())).toBe('linked')
    expect(await repo.linkCard(ALICE, card())).toBe('linked')

    expect(await repo.listCards(ALICE)).toHaveLength(1)
  })

  it('keeps Santander and Iberia apart when the digits are the same, and a card and an account apart too', async () => {
    await repo.linkCard(ALICE, card({ source: 'iberia', accountId: 1 }))
    await repo.linkCard(ALICE, card({ source: 'santander', accountId: 2 }))
    await repo.linkCard(ALICE, card({ source: 'santander', digitsKind: 'account', accountId: 1 }))

    expect((await repo.listCards(ALICE)).map((c) => [c.source, c.digitsKind, c.accountId])).toEqual([
      ['iberia', 'card', 1],
      ['santander', 'account', 1],
      ['santander', 'card', 2],
    ])
  })

  it('lets several digit sets point at one account, for a reissued card', async () => {
    await repo.linkCard(ALICE, card({ digits: '4821' }))
    await repo.linkCard(ALICE, card({ digits: '5533' }))

    expect((await repo.listCards(ALICE)).map((c) => [c.digits, c.accountId])).toEqual([['4821', 1], ['5533', 1]])
  })

  it('moves digits to another account when they are linked again', async () => {
    await repo.linkCard(ALICE, card({ accountId: 1 }))
    await repo.linkCard(ALICE, card({ accountId: 2 }))

    expect((await repo.listCards(ALICE)).map((c) => c.accountId)).toEqual([2])
  })

  it('keeps each person their own links', async () => {
    await repo.linkCard(ALICE, card())
    await repo.linkCard(BOB, card({ accountId: 9 }))

    expect(await repo.listCards(BOB)).toEqual([card({ accountId: 9 })])
    expect(await repo.unlinkCard(BOB, 'iberia', 'card', '4821')).toBe(true)
    expect(await repo.listCards(ALICE)).toEqual([card()])
  })

  it('stops at the cap, and a link that exists can still be saved at the cap', async () => {
    for (let i = 0; i < MAX_CAPTURE_CARDS; i++) expect(await repo.linkCard(ALICE, card({ digits: String(1000 + i) }))).toBe('linked')

    expect(await repo.linkCard(ALICE, card({ digits: '9999' }))).toBe('limit')
    expect(await repo.linkCard(ALICE, card({ digits: '1000', accountId: 2 }))).toBe('linked')
    expect(await repo.listCards(ALICE)).toHaveLength(MAX_CAPTURE_CARDS)
    expect(await repo.linkCard(BOB, card({ accountId: 9 }))).toBe('linked')
  })

  it('cannot pass the cap when requests arrive together', async () => {
    for (let i = 0; i < MAX_CAPTURE_CARDS - 1; i++) await repo.linkCard(ALICE, card({ digits: String(1000 + i) }))

    const results = await Promise.all(['8001', '8002', '8003'].map((digits) => repo.linkCard(ALICE, card({ digits }))))

    expect(results.filter((r) => r === 'linked')).toHaveLength(1)
    expect(await repo.listCards(ALICE)).toHaveLength(MAX_CAPTURE_CARDS)
  })
})

describe('open recommendations after a link', () => {
  it('give every open payment from the card its account, so the account is there on the next list', async () => {
    const ids = [await push(), await push(), await push()]
    expect(await Promise.all(ids.map((id) => accountOf(ALICE, id)))).toEqual([null, null, null])

    await repo.linkCard(ALICE, card())

    expect(await Promise.all(ids.map((id) => accountOf(ALICE, id)))).toEqual([1, 1, 1])
    expect((await repo.listOpenRecommendations(ALICE, 10)).map((r) => r.accountId)).toEqual([1, 1, 1])
  })

  it('leave other cards, other sources, decided payments and other people alone', async () => {
    const other = await push({ digits: '5533' })
    const santander = await push({ source: 'santander' })
    const noDigits = await push({ digits: null })
    const decided = await push()
    await repo.decideRecommendation(ALICE, decided, { state: 'dismissed', at: T0 })
    const bobs = await push({ key: 'kb' })

    await repo.linkCard(ALICE, card())

    expect(await accountOf(ALICE, other)).toBeNull()
    expect(await accountOf(ALICE, santander)).toBeNull()
    expect(await accountOf(ALICE, noDigits)).toBeNull()
    expect(await accountOf(ALICE, decided)).toBeNull()
    expect(await accountOf(BOB, bobs)).toBeNull()
  })

  it('follow the link when it moves to another account', async () => {
    const id = await push()
    await repo.linkCard(ALICE, card({ accountId: 1 }))

    await repo.linkCard(ALICE, card({ accountId: 2 }))

    expect(await accountOf(ALICE, id)).toBe(2)
  })

  it('are not changed by a link that is refused', async () => {
    const id = await push()

    await repo.linkCard(ALICE, card({ accountId: 9 }))

    expect(await accountOf(ALICE, id)).toBeNull()
  })

  it('lose the account when the link is removed, and removing it twice says so', async () => {
    const id = await push()
    await repo.linkCard(ALICE, card())
    await repo.linkCard(ALICE, card({ digits: '5533' }))
    const kept = await push({ digits: '5533' })
    await repo.linkCard(ALICE, card({ digits: '5533' }))

    expect(await repo.unlinkCard(ALICE, 'iberia', 'card', '4821')).toBe(true)
    expect(await repo.unlinkCard(ALICE, 'iberia', 'card', '4821')).toBe(false)

    expect(await accountOf(ALICE, id)).toBeNull()
    expect(await accountOf(ALICE, kept)).toBe(1)
  })

  it('carry the card they came from on a list read, and none for a push with no digits', async () => {
    await push({ digits: null })
    await push()

    const listed = await repo.listOpenRecommendations(ALICE, 10)

    expect(listed.map((r) => r.card).sort((a, b) => String(a?.digits).localeCompare(String(b?.digits)))).toEqual([{ source: 'iberia', digits: '4821' }, null])
  })
})

describe('cards waiting for an account', () => {
  it('counts the open payments of each unlinked card, and drops a card once it is linked', async () => {
    await push()
    await push()
    await push({ digits: '5533', source: 'santander' })
    await push({ digits: null })

    expect(await repo.listWaitingCards(ALICE)).toEqual([
      { source: 'iberia', digits: '4821', count: 2 },
      { source: 'santander', digits: '5533', count: 1 },
    ])
    await repo.linkCard(ALICE, card())
    expect(await repo.listWaitingCards(ALICE)).toEqual([{ source: 'santander', digits: '5533', count: 1 }])
    expect(await repo.listWaitingCards(BOB)).toEqual([])
  })

  it('shows a card again when the account it was linked to has been deleted', async () => {
    await push()
    await repo.linkCard(ALICE, card({ accountId: 2 }))
    expect(await repo.listWaitingCards(ALICE)).toEqual([])

    sqlite.prepare('DELETE FROM accounts WHERE id = 2').run()

    expect(await repo.listWaitingCards(ALICE)).toEqual([{ source: 'iberia', digits: '4821', count: 1 }])
    expect(await repo.linkCard(ALICE, card({ accountId: 1 }))).toBe('linked')
    expect(await repo.listWaitingCards(ALICE)).toEqual([])
  })
})
