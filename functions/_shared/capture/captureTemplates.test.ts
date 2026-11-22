import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { migratedDatabase, sqliteD1 } from '../../../src/testing/sqliteD1'
import { MAX_CAPTURE_TEMPLATES, TEMPLATE_LOOKUP_LIMIT } from '../../../src/domain/ports/captureRepository'
import type {
  CaptureEvent,
  CaptureRecorded,
  CaptureRepository,
  NewRecommendation,
  TemplateDecision,
} from '../../../src/domain/ports/captureRepository'
import { createD1CaptureRepository } from '../adapters/d1CaptureRepository'

const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
const T0 = '2026-03-02T09:00:00.000Z'
const SKELETON = 'card payment you paid <N> <C> at example cafe with your card <D>'

let db: DatabaseSync
let repo: CaptureRepository
let n = 0

beforeEach(async () => {
  db = migratedDatabase()
  repo = createD1CaptureRepository({ DB: sqliteD1(db) })
  n = 0
  for (const [keyId, owner] of [
    ['k1', ALICE],
    ['kb', BOB],
  ] as const) {
    await repo.createKey({ keyId, owner, label: 'Phone', secretHash: 'h', createdAt: T0 })
  }
})

function store(
  decision: TemplateDecision,
  over: Partial<CaptureEvent> = {},
): Promise<CaptureRecorded> {
  n += 1
  const event: CaptureEvent = {
    id: `e${n}`,
    keyId: 'k1',
    source: 'iberia',
    replayKey: `r${n}`,
    kind: 'push',
    amountCents: 1250,
    currency: 'EUR',
    merchantRaw: 'Example Cafe',
    last4: null,
    accountDigits: null,
    occurredAt: T0,
    localDate: '2026-03-02',
    offsetMinutes: 60,
    receivedAt: T0,
    shapeId: 'shape',
    slots: '[]',
    body: null,
    ...over,
  }
  const rec: Omit<NewRecommendation, 'owner'> = {
    id: `rec${n}`,
    accountId: null,
    amountCents: 1250,
    currency: 'EUR',
    occurredAt: T0,
    localDate: '2026-03-02',
    merchantRaw: 'Example Cafe',
    descriptionSuggested: null,
    suggestedType: 'expense',
    createdAt: T0,
  }
  return repo.recordCapture(event, rec, undefined, decision)
}

const fresh = (
  templateId: string,
  skeleton = SKELETON,
): TemplateDecision => ({ kind: 'new', template: { templateId, title: 'card payment', skeleton } })
const rows = (
  sql: string,
  ...params: Array<string | number>
) => db.prepare(sql).all(...params) as Array<Record<string, unknown>>
const templateIds = () =>
  rows('SELECT template_id FROM capture_templates ORDER BY template_id').map((r) => r.template_id)

describe('a new template', () => {
  it('is stored with the event under the key’s owner, seen once, and named on the event', async () => {
    expect(await store(fresh('t1'), { shapeId: 'abc', slots: '[{"kind":"code","index":3}]' })).toBe('created')
    expect(
      rows('SELECT owner, source, title, skeleton, seen, first_seen, last_seen, merchant_start FROM capture_templates'),
    ).toEqual([
      {
        owner: ALICE,
        source: 'iberia',
        title: 'card payment',
        skeleton: SKELETON,
        seen: 1,
        first_seen: T0,
        last_seen: T0,
        merchant_start: null,
      },
    ])
    expect(rows('SELECT template_id, shape_id, slots FROM capture_events')).toEqual([
      { template_id: 't1', shape_id: 'abc', slots: '[{"kind":"code","index":3}]' },
    ])
  })

  it('is found by owner, source and title, the most recently seen first', async () => {
    await store(fresh('t1'))
    await store(fresh('t2', 'card payment other'), { receivedAt: '2026-03-03T09:00:00.000Z' })
    await store(fresh('t3'), { keyId: 'kb' })
    expect((await repo.findTemplates(ALICE, 'iberia', 'card payment')).map((t) => t.templateId)).toEqual(['t2', 't1'])
    expect(await repo.findTemplates(ALICE, 'other', 'card payment')).toEqual([])
    expect(await repo.findTemplates(ALICE, 'iberia', 'another title')).toEqual([])
    expect((await repo.findTemplates(BOB, 'iberia', 'card payment')).map((t) => t.templateId)).toEqual(['t3'])
  })

  it('reads at most the lookup limit', async () => {
    for (let i = 0; i < TEMPLATE_LOOKUP_LIMIT + 2; i++) await store(fresh(`t${String(i).padStart(3, '0')}`, `s${i}`))
    expect(await repo.findTemplates(ALICE, 'iberia', 'card payment')).toHaveLength(TEMPLATE_LOOKUP_LIMIT)
  })
})

describe('an existing template', () => {
  it('counts the push and moves its last-seen time', async () => {
    await store(fresh('t1'))
    await store({ kind: 'existing', templateId: 't1' }, { receivedAt: '2026-03-05T09:00:00.000Z' })
    expect(rows('SELECT seen, first_seen, last_seen FROM capture_templates')).toEqual([
      { seen: 2, first_seen: T0, last_seen: '2026-03-05T09:00:00.000Z' },
    ])
  })

  it('learns a run once, and a second learner at the same time changes nothing', async () => {
    await store(fresh('t1'))
    const learned = { start: 8, end: 9, skeleton: 'card payment you paid <N> <C> at <M> with your card <D>' }
    await store({ kind: 'existing', templateId: 't1', learnedRun: learned })
    await store({ kind: 'existing', templateId: 't1', learnedRun: { start: 2, end: 3, skeleton: 'other' } })
    expect(await repo.findTemplates(ALICE, 'iberia', 'card payment')).toEqual([
      { templateId: 't1', skeleton: learned.skeleton, merchantStart: 8, merchantEnd: 9, ignoredAt: null },
    ])
    expect(rows('SELECT seen FROM capture_templates')[0]?.seen).toBe(3)
  })

  it('is not touched by another person’s push naming it', async () => {
    await store(fresh('t1'))
    await store(
      { kind: 'existing', templateId: 't1', learnedRun: { start: 1, end: 2, skeleton: 'x' } },
      { keyId: 'kb' },
    )
    expect(rows('SELECT seen, skeleton FROM capture_templates')).toEqual([{ seen: 1, skeleton: SKELETON }])
    expect(rows("SELECT template_id FROM capture_events WHERE key_id = 'kb'")).toEqual([{ template_id: null }])
  })
})

describe('a push that is not stored', () => {
  it('changes no template when it is a replay', async () => {
    await store(fresh('t1'), { replayKey: 'same' })
    expect(
      await store(
        { kind: 'existing', templateId: 't1', learnedRun: { start: 1, end: 2, skeleton: 'x' } },
        { replayKey: 'same' },
      ),
    ).toBe(false)
    expect(await store(fresh('t2'), { replayKey: 'same' })).toBe(false)
    expect(rows('SELECT template_id, seen, skeleton FROM capture_templates')).toEqual([
      { template_id: 't1', seen: 1, skeleton: SKELETON },
    ])
  })
})

describe('the template cap', () => {
  async function fill(): Promise<void> {
    db.exec('BEGIN')
    const insert = db.prepare(
      `INSERT INTO capture_templates (owner, template_id, source, title, skeleton, first_seen, last_seen, accepts, ignored_at)
       VALUES (?, ?, 'iberia', 't', ?, ?, ?, ?, ?)`,
    )
    for (let i = 0; i < MAX_CAPTURE_TEMPLATES; i++) {
      const day = `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z`
      insert.run(ALICE, `old${String(i).padStart(3, '0')}`, `s${i}`, day, day, 1, null)
    }
    db.exec('COMMIT')
  }
  const markOldest = (sql: string) => db.prepare(`UPDATE capture_templates SET ${sql} WHERE template_id = ?`)

  it('evicts the least recently seen template nobody has accepted, never an ignored one', async () => {
    await fill()
    db.prepare('UPDATE capture_templates SET accepts = 0 WHERE template_id IN (?, ?, ?)').run(
      'old001',
      'old002',
      'old003',
    )
    markOldest("ignored_at = '2026-02-01'").run('old001')
    await store(fresh('new'))
    const ids = templateIds()
    expect(ids).toHaveLength(MAX_CAPTURE_TEMPLATES)
    expect(ids).toContain('new')
    expect(ids).toContain('old001')
    expect(ids).not.toContain('old002')
    expect(ids).toContain('old003')
  })

  it('stores the event with no template when none can be evicted', async () => {
    await fill()
    expect(await store(fresh('new'))).toBe('created')
    expect(templateIds()).not.toContain('new')
    expect(rows('SELECT template_id FROM capture_events')).toEqual([{ template_id: null }])
    expect(rows('SELECT COUNT(*) AS n FROM recommendations')[0]?.n).toBe(1)
  })

  it('counts each person’s templates on their own', async () => {
    await fill()
    db.prepare('UPDATE capture_templates SET accepts = 0').run()
    await store(fresh('bobs'), { keyId: 'kb' })
    expect(templateIds()).toHaveLength(MAX_CAPTURE_TEMPLATES + 1)
  })
})

describe('a push with no template', () => {
  it('writes no template and names none', async () => {
    expect(await store({ kind: 'none' })).toBe('created')
    expect(rows('SELECT COUNT(*) AS n FROM capture_templates')[0]?.n).toBe(0)
    expect(rows('SELECT template_id FROM capture_events')).toEqual([{ template_id: null }])
  })

  it('is what recordCapture assumes when no decision is passed', async () => {
    const event = {
      id: 'x',
      keyId: 'k1',
      source: 'iberia',
      replayKey: 'rx',
      kind: 'push',
      amountCents: 1250,
      currency: 'EUR',
      merchantRaw: null,
      last4: null,
      accountDigits: null,
      occurredAt: T0,
      localDate: '2026-03-02',
      offsetMinutes: 0,
      receivedAt: T0,
      body: null,
    } as const
    expect(
      await repo.recordCapture(event, {
        id: 'rx',
        accountId: null,
        amountCents: 1250,
        currency: 'EUR',
        occurredAt: T0,
        localDate: '2026-03-02',
        merchantRaw: null,
        descriptionSuggested: null,
        suggestedType: 'expense',
        createdAt: T0,
      }),
    ).toBe('created')
    expect(rows('SELECT template_id, shape_id, slots FROM capture_events')).toEqual([
      { template_id: null, shape_id: null, slots: null },
    ])
  })
})

describe('the columns', () => {
  it('refuse slots over 2,000 characters and a template over 1,000', async () => {
    await expect(store({ kind: 'none' }, { slots: 'x'.repeat(2001) })).rejects.toThrow()
    await expect(store(fresh('t1', 'x'.repeat(1001)))).rejects.toThrow()
    expect(rows('SELECT COUNT(*) AS n FROM capture_events')[0]?.n).toBe(0)
  })
})
