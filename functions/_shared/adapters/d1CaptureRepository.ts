import type {
  CaptureCaps,
  CaptureEvent,
  CaptureRepository,
  NewRecommendation,
  Recommendation,
} from '../../../src/domain/ports/captureRepository'
import type { Env } from '../env'
import {
  eventParams,
  BUMP_COUNTER_SQL,
  ADMIT_SQL,
  EVENTS_SINCE_SQL,
  HAS_EVENT_SQL,
  LAST_CAPTURE_SQL,
  READ_COUNTERS_SQL,
  RECORD_EVENT_SQL,
  RECORD_RECOMMENDATION_SQL,
} from '../capture/captureEventsSql'
import { CARDS_OF_RECOMMENDATIONS_SQL } from '../capture/captureCardsSql'
import { cards } from './d1CaptureCards'
import { changed, rows } from './d1CaptureSupport'
import {
  CREATE_KEY_SQL,
  FIND_KEY_SQL,
  LIST_KEYS_SQL,
  REVOKE_KEY_SQL,
  TOUCH_KEY_SQL,
  keyParams,
  toKey,
  toSummary,
  touchCutoff,
} from '../capture/captureKeysSql'
import type { KeyRow } from '../capture/captureKeysSql'
import {
  COUNT_OPEN_SQL,
  CREATE_RECOMMENDATION_SQL,
  DECIDE_SQL,
  GET_RECOMMENDATION_SQL,
  LIST_OPEN_AFTER_SQL,
  LIST_OPEN_FIRST_SQL,
  createParams,
  toRecommendation,
} from '../capture/captureRecommendationsSql'
import type { RecommendationRow } from '../capture/captureRecommendationsSql'

type Statements = Pick<CaptureRepository, 'createKey' | 'findKey' | 'listKeys' | 'revokeKey' | 'touchKey'>

function keys(db: D1Database): Statements {
  return {
    createKey: (key) => changed(db, CREATE_KEY_SQL, ...keyParams(key)),
    findKey: async (keyId) => {
      const row = await db.prepare(FIND_KEY_SQL).bind(keyId).first<KeyRow>()
      return row ? toKey(row) : null
    },
    listKeys: async (owner) => (await rows<KeyRow>(db, LIST_KEYS_SQL, owner)).map(toSummary),
    revokeKey: (owner, keyId, at) => changed(db, REVOKE_KEY_SQL, owner, keyId, at),
    touchKey: async (keyId, at) => {
      await changed(db, TOUCH_KEY_SQL, keyId, at, touchCutoff(at))
    },
  }
}

async function recordCapture(
  db: D1Database,
  event: CaptureEvent,
  rec: Omit<NewRecommendation, 'owner'>,
  caps: CaptureCaps | undefined,
): Promise<boolean> {
  const results = await db.batch([
    db.prepare(RECORD_EVENT_SQL).bind(...eventParams(event, rec.id, caps)),
    db
      .prepare(RECORD_RECOMMENDATION_SQL)
      .bind(
        event.id,
        rec.id,
        rec.accountId,
        rec.amountCents,
        rec.currency,
        rec.occurredAt,
        rec.localDate,
        rec.merchantRaw,
        rec.descriptionSuggested,
        rec.suggestedType,
        rec.createdAt,
      ),
  ])
  return (results[0]?.meta?.changes ?? 0) > 0
}

function events(
  db: D1Database,
): Pick<
  CaptureRepository,
  | 'recordEvent'
  | 'recordCapture'
  | 'hasEvent'
  | 'admit'
  | 'eventsSince'
  | 'lastCaptureAt'
  | 'bumpCounter'
  | 'readCounters'
> {
  return {
    recordEvent: (event, caps) => changed(db, RECORD_EVENT_SQL, ...eventParams(event, null, caps)),
    recordCapture: (event, rec, caps) => recordCapture(db, event, rec, caps),
    hasEvent: async (keyId, source, replayKey) =>
      (await db.prepare(HAS_EVENT_SQL).bind(keyId, source, replayKey).first()) !== null,
    admit: (owner, source, day, caps) => changed(db, ADMIT_SQL, owner, source, day, caps.perOwner, caps.global),
    eventsSince: async (keyId, since) => {
      const row = await db.prepare(EVENTS_SINCE_SQL).bind(keyId, since).first<{ n: number }>()
      return row?.n ?? 0
    },
    lastCaptureAt: async (owner, source) => {
      const row = await db.prepare(LAST_CAPTURE_SQL).bind(owner, source).first<{ at: string | null }>()
      return row?.at ?? null
    },
    bumpCounter: async (owner, source, day, field) => {
      await changed(db, BUMP_COUNTER_SQL[field], owner, source, day)
    },
    readCounters: async (owner, fromDay) =>
      (
        await rows<{ source: string; day: string; received: number; unrecognised: number }>(
          db,
          READ_COUNTERS_SQL,
          owner,
          fromDay,
        )
      ).map((r) => ({
        source: r.source as 'iberia' | 'santander',
        day: r.day,
        received: r.received,
        unrecognised: r.unrecognised,
      })),
  }
}

/** Adds the card each recommendation of a page came from, in one read. */
async function withCards(db: D1Database, owner: string, page: Recommendation[]): Promise<Recommendation[]> {
  if (page.length === 0) return page
  const found = await rows<{ rec_id: string; source: string; last4: string }>(
    db,
    CARDS_OF_RECOMMENDATIONS_SQL,
    owner,
    JSON.stringify(page.map((r) => r.id)),
  )
  const byRec = new Map(found.map((r) => [r.rec_id, { source: r.source as 'iberia' | 'santander', digits: r.last4 }]))
  return page.map((r) => ({ ...r, card: byRec.get(r.id) ?? null }))
}

function recommendations(
  db: D1Database,
): Pick<
  CaptureRepository,
  'createRecommendation' | 'getRecommendation' | 'listOpenRecommendations' | 'countOpenRecommendations' | 'decideRecommendation'
> {
  return {
    createRecommendation: async (rec) => {
      await changed(db, CREATE_RECOMMENDATION_SQL, ...createParams(rec))
    },
    getRecommendation: async (owner, id) => {
      const row = await db.prepare(GET_RECOMMENDATION_SQL).bind(owner, id).first<RecommendationRow>()
      return row ? toRecommendation(row) : null
    },
    listOpenRecommendations: async (owner, limit, after) => {
      const page = (
        after
          ? await rows<RecommendationRow>(db, LIST_OPEN_AFTER_SQL, owner, limit, after.localDate, after.id)
          : await rows<RecommendationRow>(db, LIST_OPEN_FIRST_SQL, owner, limit)
      ).map(toRecommendation)
      return withCards(db, owner, page)
    },
    countOpenRecommendations: async (owner) =>
      (await db.prepare(COUNT_OPEN_SQL).bind(owner).first<{ n: number }>())?.n ?? 0,
    decideRecommendation: (owner, id, d) =>
      changed(db, DECIDE_SQL, owner, id, d.state, d.state === 'submitted' ? d.txnId : null, d.at),
  }
}

export function createD1CaptureRepository(env: Pick<Env, 'DB'>): CaptureRepository {
  const db = env.DB
  return { ...keys(db), ...events(db), ...cards(db), ...recommendations(db) }
}
