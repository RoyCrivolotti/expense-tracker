import type { CaptureRepository } from '../../../src/domain/ports/captureRepository'
import type { Env } from '../env'
import {
  eventParams,
  BUMP_COUNTER_SQL,
  EVENTS_SINCE_SQL,
  LAST_CAPTURE_SQL,
  LIST_CARDS_SQL,
  READ_COUNTERS_SQL,
  RECORD_EVENT_SQL,
  SAVE_CARD_SQL,
} from '../capture/captureEventsSql'
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
  CREATE_RECOMMENDATION_SQL,
  DECIDE_SQL,
  GET_RECOMMENDATION_SQL,
  LIST_OPEN_AFTER_SQL,
  LIST_OPEN_FIRST_SQL,
  createParams,
  toRecommendation,
} from '../capture/captureRecommendationsSql'
import type { RecommendationRow } from '../capture/captureRecommendationsSql'

/** D1 reports a change count on a write: 0 means the guard in the statement stopped it. */
async function changed(db: D1Database, sql: string, ...params: Array<string | number | null>): Promise<boolean> {
  const result = await db
    .prepare(sql)
    .bind(...params)
    .run()
  return (result.meta?.changes ?? 0) > 0
}

async function rows<T>(db: D1Database, sql: string, ...params: Array<string | number | null>): Promise<T[]> {
  return (
    await db
      .prepare(sql)
      .bind(...params)
      .all<T>()
  ).results
}

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

function events(
  db: D1Database,
): Pick<CaptureRepository, 'recordEvent' | 'eventsSince' | 'lastCaptureAt' | 'bumpCounter' | 'readCounters'> {
  return {
    recordEvent: (event) => changed(db, RECORD_EVENT_SQL, ...eventParams(event)),
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

function cards(db: D1Database): Pick<CaptureRepository, 'saveCard' | 'listCards'> {
  return {
    saveCard: async (owner, c) => {
      await changed(db, SAVE_CARD_SQL, owner, c.source, c.digitsKind, c.digits, c.accountId)
    },
    listCards: async (owner) =>
      (
        await rows<{ source: string; digits_kind: string; digits: string; account_id: number }>(
          db,
          LIST_CARDS_SQL,
          owner,
        )
      ).map((r) => ({
        source: r.source as 'iberia' | 'santander',
        digitsKind: r.digits_kind as 'card' | 'account',
        digits: r.digits,
        accountId: r.account_id,
      })),
  }
}

function recommendations(
  db: D1Database,
): Pick<
  CaptureRepository,
  'createRecommendation' | 'getRecommendation' | 'listOpenRecommendations' | 'decideRecommendation'
> {
  return {
    createRecommendation: async (rec) => {
      await changed(db, CREATE_RECOMMENDATION_SQL, ...createParams(rec))
    },
    getRecommendation: async (owner, id) => {
      const row = await db.prepare(GET_RECOMMENDATION_SQL).bind(owner, id).first<RecommendationRow>()
      return row ? toRecommendation(row) : null
    },
    listOpenRecommendations: async (owner, limit, after) =>
      (after
        ? await rows<RecommendationRow>(db, LIST_OPEN_AFTER_SQL, owner, limit, after.localDate, after.id)
        : await rows<RecommendationRow>(db, LIST_OPEN_FIRST_SQL, owner, limit)
      ).map(toRecommendation),
    decideRecommendation: (owner, id, d) =>
      changed(db, DECIDE_SQL, owner, id, d.state, d.state === 'submitted' ? d.txnId : null, d.at),
  }
}

export function createD1CaptureRepository(env: Pick<Env, 'DB'>): CaptureRepository {
  const db = env.DB
  return { ...keys(db), ...events(db), ...cards(db), ...recommendations(db) }
}
