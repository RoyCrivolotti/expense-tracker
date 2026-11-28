import { beforeEach, describe, expect, it } from 'vitest'
import { GROUP_WINDOW_MS, sameMovement } from '../../../src/domain/capture'
import type { GroupablePush } from '../../../src/domain/capture'
import type { CaptureEvent } from '../../../src/domain/ports/captureEvents'
import type { CaptureRepository } from '../../../src/domain/ports/captureRepository'
import type { TemplateDecision } from '../../../src/domain/ports/captureTemplates'
import { migratedDatabase, sqliteD1 } from '../../../src/testing/sqliteD1'
import { createD1CaptureRepository } from '../adapters/d1CaptureRepository'

/*
 * One table of pairs of pushes, judged by `sameMovement` and by the statement that stores a push (`RECORD_EVENT_SQL`),
 * which must agree on every one. The SQL side stores the first push with a recommendation of its own, then the second,
 * and reads whether the second joined it.
 */

const OWNER = 'casey@example.com'
const AT = Date.parse('2026-08-14T17:23:09.000Z')

interface Case {
  name: string
  first: GroupablePush
  second: GroupablePush
  joins: boolean
}

const base: GroupablePush = {
  amountCents: 3_475,
  amountMinus: false,
  currency: 'EUR',
  occurredAtMs: AT,
  templateId: null,
  shapeId: 'shape-transfer',
}
const other = (over: Partial<GroupablePush> = {}): GroupablePush => ({
  ...base,
  occurredAtMs: AT + 9_000,
  shapeId: 'shape-balance',
  ...over,
})

const CASES: Case[] = [
  { name: 'no sign on either', first: base, second: other(), joins: true },
  {
    name: 'a minus on both',
    first: { ...base, amountMinus: true },
    second: other({ amountMinus: true }),
    joins: true,
  },
  { name: 'a minus on the first only', first: { ...base, amountMinus: true }, second: other(), joins: false },
  { name: 'a minus on the second only', first: base, second: other({ amountMinus: true }), joins: false },
  {
    name: 'the first stored before the sign was kept, the second with a minus',
    first: { ...base, amountMinus: null },
    second: other({ amountMinus: true }),
    joins: true,
  },
  {
    name: 'the first stored before the sign was kept, the second without',
    first: { ...base, amountMinus: null },
    second: other(),
    joins: true,
  },
  {
    name: 'neither with a sign kept',
    first: { ...base, amountMinus: null },
    second: other({ amountMinus: null }),
    joins: true,
  },
  {
    name: 'the second written without the reader, the first with a minus',
    first: { ...base, amountMinus: true },
    second: other({ amountMinus: null }),
    joins: true,
  },
  {
    name: 'a zero amount, no sign on either',
    first: { ...base, amountCents: 0 },
    second: other({ amountCents: 0 }),
    joins: true,
  },
  {
    name: 'a zero amount, a minus on one',
    first: { ...base, amountCents: 0, amountMinus: true },
    second: other({ amountCents: 0 }),
    joins: false,
  },
  {
    name: 'a large amount, a minus on both',
    first: { ...base, amountCents: 1_250_000, amountMinus: true },
    second: other({ amountCents: 1_250_000, amountMinus: true }),
    joins: true,
  },
  { name: 'a cent apart', first: base, second: other({ amountCents: 3_476 }), joins: false },
  { name: 'another currency', first: base, second: other({ currency: 'GBP' }), joins: false },
  {
    name: 'another currency, a minus on both',
    first: { ...base, amountMinus: true },
    second: other({ currency: 'GBP', amountMinus: true }),
    joins: false,
  },
  {
    name: 'the same wording, a minus on both',
    first: { ...base, amountMinus: true },
    second: other({ shapeId: base.shapeId, amountMinus: true }),
    joins: false,
  },
  {
    name: 'the same template, other shapes',
    first: { ...base, templateId: 'tpl-1' },
    second: other({ templateId: 'tpl-1' }),
    joins: false,
  },
  // Whole seconds, as every push moment is (`parsePushDate`): the SQL compares whole seconds, so a gap of 120.5 s would
  // join there and not here, and no push can be dated that way.
  {
    name: 'exactly the window later',
    first: base,
    second: other({ occurredAtMs: AT + GROUP_WINDOW_MS }),
    joins: true,
  },
  {
    name: 'exactly the window earlier',
    first: base,
    second: other({ occurredAtMs: AT - GROUP_WINDOW_MS }),
    joins: true,
  },
  {
    name: 'a second past the window',
    first: base,
    second: other({ occurredAtMs: AT + GROUP_WINDOW_MS + 1_000 }),
    joins: false,
  },
  {
    name: 'a minus on one, at the same second',
    first: { ...base, amountMinus: true },
    second: other({ occurredAtMs: AT }),
    joins: false,
  },
  {
    name: 'a minus on both, exactly the window later',
    first: { ...base, amountMinus: true },
    second: other({ occurredAtMs: AT + GROUP_WINDOW_MS, amountMinus: true }),
    joins: true,
  },
]

let repo: CaptureRepository

beforeEach(async () => {
  repo = createD1CaptureRepository({ DB: sqliteD1(migratedDatabase()) })
  await repo.createKey({
    keyId: 'key-1',
    owner: OWNER,
    label: 'Phone',
    secretHash: 'hash',
    createdAt: new Date(AT - 86_400_000).toISOString(),
  })
})

function eventOf(
  push: GroupablePush,
  id: string,
): CaptureEvent {
  const occurredAt = new Date(push.occurredAtMs).toISOString()
  return {
    id,
    keyId: 'key-1',
    source: 'bank-example',
    replayKey: `replay-${id}`,
    kind: 'push',
    amountCents: push.amountCents,
    // Left out rather than null for the rows written before the sign was kept, as such a writer would.
    ...(push.amountMinus === null ? {} : { amountMinus: push.amountMinus }),
    currency: push.currency,
    merchantRaw: null,
    last4: null,
    accountDigits: null,
    occurredAt,
    localDate: occurredAt.slice(0, 10),
    offsetMinutes: 0,
    receivedAt: occurredAt,
    shapeId: push.shapeId,
    body: null,
  }
}

/** The first push of a template makes it, as the Worker does; an event naming a template that does not exist loses it. */
function decisionOf(
  push: GroupablePush,
  made: Set<string>,
): TemplateDecision {
  const { templateId } = push
  if (templateId === null) return { kind: 'none' }
  if (made.has(templateId)) return { kind: 'existing', templateId }
  made.add(templateId)
  return { kind: 'new', template: { templateId, title: 'transfer', skeleton: 'transfer of <N> <C>' } }
}

async function store(
  push: GroupablePush,
  id: string,
  made: Set<string>,
) {
  const event = eventOf(push, id)
  return repo.recordCapture(
    event,
    {
      id: `rec-${id}`,
      accountId: null,
      amountCents: push.amountCents,
      currency: push.currency,
      occurredAt: event.occurredAt,
      localDate: event.localDate,
      merchantRaw: null,
      descriptionSuggested: null,
      suggestedType: 'expense',
      createdAt: event.receivedAt,
    },
    undefined,
    decisionOf(push, made),
  )
}

describe('sameMovement and the statement that stores a push', () => {
  it.each(CASES)('agree: $name', async ({ first, second, joins }) => {
    expect(sameMovement(first, second)).toBe(joins)
    expect(sameMovement(second, first)).toBe(joins)
    const made = new Set<string>()
    expect(await store(first, 'a', made)).toBe('created')
    expect(await store(second, 'b', made)).toBe(joins ? 'grouped' : 'created')
  })
})
