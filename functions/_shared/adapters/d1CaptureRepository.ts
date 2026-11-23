import { MAX_IGNORED_LISTED, TEMPLATE_LOOKUP_LIMIT } from '../../../src/domain/ports/captureTemplates'
import type { CaptureRepository } from '../../../src/domain/ports/captureRepository'
import type { CaptureRecommendationStore, Recommendation } from '../../../src/domain/ports/captureRecommendations'
import type { CaptureKeyStore } from '../../../src/domain/ports/captureKeys'
import type { CaptureLearningStore } from '../../../src/domain/ports/captureLearning'
import type { CaptureTemplateStore } from '../../../src/domain/ports/captureTemplates'
import type { Env } from '../env'
import { CARDS_OF_RECOMMENDATIONS_SQL } from '../capture/captureCardsSql'
import { FIND_TEMPLATES_SQL, LIST_IGNORED_SQL, UNIGNORE_SQL, toIgnored } from '../capture/captureTemplatesSql'
import type { IgnoredRow, TemplateRow } from '../capture/captureTemplatesSql'
import { cards } from './d1CaptureCards'
import { status } from './d1CaptureStatus'
import { findMatch, withMatches } from './d1CaptureMatches'
import { merchantRows, withSuggestions } from './d1CaptureSuggestions'
import { applyDecisionLearning, countIgnoredPush, decide } from './d1CaptureWrites'
import { counters, events } from './d1CaptureEvents'
import { EVENT_OF_RECOMMENDATION_SQL, toEvent } from '../capture/captureLearningSql'
import type { EventRow } from '../capture/captureLearningSql'
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
  SUMMARIZE_OPEN_SQL,
  toOpenSummary,
  CREATE_RECOMMENDATION_SQL,
  GET_RECOMMENDATION_SQL,
  LIST_OPEN_AFTER_SQL,
  LIST_OPEN_FIRST_SQL,
  createParams,
  toRecommendation,
} from '../capture/captureRecommendationsSql'
import type { OpenSummaryRow, RecommendationRow } from '../capture/captureRecommendationsSql'

function keys(db: D1Database): CaptureKeyStore {
  return {
    createKey: (key) => changed(db, CREATE_KEY_SQL, ...keyParams(key)),
    findKey: async (keyId) => {
      const row = await db.prepare(FIND_KEY_SQL).bind(keyId).first<KeyRow>()
      return row ? toKey(row) : null
    },
    listKeys: async (owner) => (await rows<KeyRow>(db, LIST_KEYS_SQL, owner)).map(toSummary),
    revokeKey: (
      owner,
      keyId,
      at,
    ) => changed(db, REVOKE_KEY_SQL, owner, keyId, at),
    touchKey: async (
      keyId,
      at,
    ) => {
      await changed(db, TOUCH_KEY_SQL, keyId, at, touchCutoff(at))
    },
  }
}

/** Adds the card each recommendation of a page came from, in one read. */
async function withCards(
  db: D1Database,
  owner: string,
  page: Recommendation[],
): Promise<Recommendation[]> {
  if (page.length === 0) return page
  const found = await rows<{ rec_id: string; source: string; last4: string }>(
    db,
    CARDS_OF_RECOMMENDATIONS_SQL,
    owner,
    JSON.stringify(page.map((r) => r.id)),
  )
  const byRec = new Map(found.map((r) => [r.rec_id, { source: r.source, digits: r.last4 }]))
  return page.map((r) => ({ ...r, card: byRec.get(r.id) ?? null }))
}

function recommendations(db: D1Database): CaptureRecommendationStore {
  return {
    createRecommendation: async (rec) => {
      await changed(db, CREATE_RECOMMENDATION_SQL, ...createParams(rec))
    },
    getRecommendation: async (
      owner,
      id,
    ) => {
      const row = await db.prepare(GET_RECOMMENDATION_SQL).bind(owner, id).first<RecommendationRow>()
      return row ? toRecommendation(row) : null
    },
    listOpenRecommendations: async (
      owner,
      limit,
      after,
    ) => {
      const page = (
        after
          ? await rows<RecommendationRow>(db, LIST_OPEN_AFTER_SQL, owner, limit, after.localDate, after.id)
          : await rows<RecommendationRow>(db, LIST_OPEN_FIRST_SQL, owner, limit)
      ).map(toRecommendation)
      // The suggestion first, so the duplicate check looks for the amount and direction the person will see.
      return withMatches(db, owner, await withSuggestions(db, owner, await withCards(db, owner, page)))
    },
    findPossibleMatch: (
      owner,
      payment,
    ) => findMatch(db, owner, payment),
    countOpenRecommendations: async (owner) =>
      (await db.prepare(COUNT_OPEN_SQL).bind(owner).first<{ n: number }>())?.n ?? 0,
    summarizeOpen: async (owner) =>
      toOpenSummary(await db.prepare(SUMMARIZE_OPEN_SQL).bind(owner).first<OpenSummaryRow>()),
    decideRecommendation: (
      owner,
      id,
      d,
    ) => decide(db, owner, id, d),
  }
}

function templates(db: D1Database): CaptureTemplateStore {
  return {
    listIgnoredTemplates: async (owner) =>
      (await rows<IgnoredRow>(db, LIST_IGNORED_SQL, owner, MAX_IGNORED_LISTED)).map(toIgnored),
    unignoreTemplate: (
      owner,
      templateId,
    ) => changed(db, UNIGNORE_SQL, owner, templateId),
    findTemplates: async (
      owner,
      source,
      title,
    ) =>
      (await rows<TemplateRow>(db, FIND_TEMPLATES_SQL, owner, source, title, TEMPLATE_LOOKUP_LIMIT)).map((r) => ({
        templateId: r.template_id,
        skeleton: r.skeleton,
        merchantStart: r.merchant_start,
        merchantEnd: r.merchant_end,
        ignoredAt: r.ignored_at,
      })),
    countIgnoredPush: (
      owner,
      source,
      day,
      templateId,
      at,
    ) => countIgnoredPush(db, owner, source, day, templateId, at),
  }
}

function learning(db: D1Database): CaptureLearningStore {
  return {
    merchantRows: async (
      owner,
      key,
    ) => (await merchantRows(db, owner, [key])).get(key) ?? [],
    eventOfRecommendation: async (
      owner,
      recId,
    ) => {
      const row = await db.prepare(EVENT_OF_RECOMMENDATION_SQL).bind(owner, recId).first<EventRow>()
      return row ? toEvent(row) : null
    },
    applyDecisionLearning: (
      owner,
      recId,
      learning,
    ) => applyDecisionLearning(db, owner, recId, learning),
  }
}

export function createD1CaptureRepository(env: Pick<Env, 'DB'>): CaptureRepository {
  const db = env.DB
  return {
    ...keys(db),
    ...events(db),
    ...counters(db),
    ...cards(db),
    ...status(db),
    ...recommendations(db),
    ...templates(db),
    ...learning(db),
  }
}
