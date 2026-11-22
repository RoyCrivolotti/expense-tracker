/**
 * Every statement capture runs must reach its rows through an index that starts with the owner (or the key), and
 * never scan a table that grows or sort a page the index already orders. D1 bills the rows SQLite visits, and a
 * captured push is one of the most frequent writes the app will see. Run with and without table statistics, with
 * several owners present, because a planner with no statistics picks differently.
 */
import { describe, expect, it } from 'vitest'
import { MATCH_CANDIDATES_SQL } from './captureMatchesSql'
import {
  CARDS_OF_RECOMMENDATIONS_SQL,
  CLEAR_OPEN_OF_UNLINKED_SQL,
  LINK_CARD_SQL,
  POINT_OPEN_AT_LINK_SQL,
  UNLINK_CARD_SQL,
  WAITING_CARDS_SQL,
} from './captureCardsSql'
import { migratedDatabase } from '../../../src/testing/sqliteD1'
import {
  BLANK_OLD_TEXT_SQL,
  BUMP_COUNTER_SQL,
  EVENTS_SINCE_SQL,
  JOIN_MERCHANT_SQL,
  LAST_CAPTURE_SQL,
  LIST_CARDS_SQL,
  READ_COUNTERS_SQL,
  RECORD_EVENT_SQL,
  RECORD_RECOMMENDATION_SQL,
  SAVE_CARD_SQL,
  eventParams,
} from './captureEventsSql'
import {
  EVENT_OF_RECOMMENDATION_SQL,
  EVICT_MERCHANTS_SQL,
  LEARN_DECISION_SQL,
  RECORD_OUTCOME_SQL,
  VOTE_MERCHANT_SQL,
} from './captureLearningSql'
import { MERCHANT_ROWS_SQL, SUGGESTION_EVENTS_SQL } from './captureSuggestionsSql'
import { COUNTED_SOURCES_SQL, MUTED_TEMPLATES_SQL, SOURCE_OUTCOMES_SQL } from './captureStatusSql'
import { CREATE_KEY_SQL, FIND_KEY_SQL, LIST_KEYS_SQL, REVOKE_KEY_SQL, TOUCH_KEY_SQL } from './captureKeysSql'
import {
  DROP_MISSING_TEMPLATE_SQL,
  EVICT_TEMPLATE_SQL,
  FIND_TEMPLATES_SQL,
  INSERT_TEMPLATE_SQL,
  LEARN_RUN_SQL,
  LIST_IGNORED_SQL,
  SEEN_IGNORED_SQL,
  UNIGNORE_SQL,
  SEEN_TEMPLATE_SQL,
} from './captureTemplatesSql'
import {
  BLANK_DECIDED_TEXT_SQL,
  CREATE_RECOMMENDATION_SQL,
  DECIDE_SQL,
  GET_RECOMMENDATION_SQL,
  LIST_OPEN_AFTER_SQL,
  LIST_OPEN_FIRST_SQL,
} from './captureRecommendationsSql'

function seeded(analyze: boolean) {
  const db = migratedDatabase()
  const owners = Array.from({ length: 6 }, (_, i) => `owner${i}@example.com`)
  for (const [o, owner] of owners.entries()) {
    db.prepare('INSERT INTO capture_keys (key_id, owner, label, secret_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(
      `k${o}`,
      owner,
      'p',
      'h',
      '2026-03-01',
    )
    for (let i = 0; i < 40; i++) {
      db.prepare(
        `INSERT INTO capture_events (id, owner, key_id, source, replay_key, kind, occurred_at, local_date, offset_minutes, received_at, rec_id, body)
         VALUES (?, ?, ?, 'iberia', ?, 'card-purchase', '2026-03-01', '2026-03-01', 60, ?, ?, ?)`,
      ).run(
        `e${o}-${i}`,
        owner,
        `k${o}`,
        `r${o}-${i}`,
        `2026-03-${String(1 + (i % 28)).padStart(2, '0')}`,
        `rec${o}-${i}`,
        i % 5 === 0 ? 'text' : null,
      )
      db.prepare(
        `INSERT INTO recommendations (id, owner, occurred_at, local_date, created_at) VALUES (?, ?, '2026-03-01', ?, '2026-03-01')`,
      ).run(`rec${o}-${i}`, owner, `2026-03-${String(1 + (i % 28)).padStart(2, '0')}`)
      db.prepare("INSERT INTO capture_counters (owner, source, day) VALUES (?, 'iberia', ?)").run(
        owner,
        `2026-02-${String(1 + (i % 28)).padStart(2, '0')}-${i}`,
      )
      db.prepare(
        `INSERT INTO capture_templates (owner, template_id, source, title, skeleton, first_seen, last_seen)
         VALUES (?, ?, 'iberia', ?, ?, '2026-03-01', ?)`,
      ).run(owner, `t${o}-${i}`, `title ${i % 4}`, `skeleton ${i}`, `2026-03-${String(1 + (i % 28)).padStart(2, '0')}`)
      for (const amount of [-1, 100 * (1 + (i % 3))]) {
        db.prepare(
          `INSERT INTO capture_merchants (owner, key, amount_cents, description, votes, last_seen) VALUES (?, ?, ?, ?, 1, ?)`,
        ).run(
          owner,
          `merchant ${i % 10}`,
          amount,
          `Shop ${i}`,
          `2026-03-${String(1 + (i % 28)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}`,
        )
      }
    }
  }
  if (analyze) db.exec('ANALYZE')
  return db
}

const OWNER = 'owner1@example.com'

/** A push that brings a recommendation of its own, so the statement looks for an open one of the same movement. */
const GROUPING_PUSH = eventParams(
  {
    id: 'e-new',
    keyId: 'k1',
    source: 'iberia',
    replayKey: 'r-new',
    kind: 'push',
    amountCents: 100,
    currency: 'EUR',
    merchantRaw: null,
    last4: null,
    accountDigits: null,
    occurredAt: '2026-03-01T08:00:00.000Z',
    localDate: '2026-03-01',
    offsetMinutes: 60,
    receivedAt: '2026-03-01T08:00:05.000Z',
    body: null,
    shapeId: 's',
  },
  'rec-new',
  undefined,
  't1-1',
)
const planOf = (
  db: ReturnType<typeof seeded>,
  sql: string,
  params: Array<string | number | null>,
): string => {
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params)
  return rows.map((r) => String(r.detail)).join('\n')
}

// [name, sql, params, a pattern every plan must match]
const CASES: Array<[string, string, Array<string | number | null>, RegExp]> = [
  ['find a key', FIND_KEY_SQL, ['k1'], /SEARCH capture_keys USING (INDEX sqlite_autoindex_capture_keys_1|PRIMARY KEY)/],
  [
    'list the owner’s keys',
    LIST_KEYS_SQL,
    [OWNER],
    /SEARCH capture_keys USING INDEX idx_capture_keys_owner \(owner=\?\)/,
  ],
  [
    'revoke',
    REVOKE_KEY_SQL,
    [OWNER, 'k1', 'x'],
    /SEARCH capture_keys USING (INDEX sqlite_autoindex_capture_keys_1|PRIMARY KEY)/,
  ],
  [
    'touch',
    TOUCH_KEY_SQL,
    ['k1', 'x', 'y'],
    /SEARCH capture_keys USING (INDEX sqlite_autoindex_capture_keys_1|PRIMARY KEY)/,
  ],
  [
    'the key limit inside the insert',
    CREATE_KEY_SQL,
    ['k9', OWNER, 'l', 'h', 't'],
    /SEARCH capture_keys USING INDEX idx_capture_keys_owner \(owner=\?\)/,
  ],
  [
    'pushes since, per key',
    EVENTS_SINCE_SQL,
    ['k1', 'x'],
    /SEARCH capture_events USING (COVERING )?INDEX idx_capture_events_key \(key_id=\? AND received_at>/,
  ],
  [
    'last capture',
    LAST_CAPTURE_SQL,
    [OWNER, 'iberia'],
    /SEARCH capture_events USING (COVERING )?INDEX idx_capture_events_source \(owner=\? AND source=\?\)/,
  ],
  [
    'read counters',
    READ_COUNTERS_SQL,
    [OWNER, '2026-02-01'],
    /SEARCH capture_counters USING INDEX sqlite_autoindex_capture_counters_1 \(owner=\?\)/,
  ],
  [
    'the sources a person was counted under',
    COUNTED_SOURCES_SQL,
    [OWNER],
    /SEARCH capture_counters USING COVERING INDEX sqlite_autoindex_capture_counters_1 \(owner=\?\)/,
  ],
  [
    'what became of each source’s pushes',
    SOURCE_OUTCOMES_SQL,
    [OWNER, '2026-03-10'],
    /SEARCH e USING INDEX idx_capture_events_source \(owner=\? AND source=\? AND received_at>\?\)[\s\S]*SEARCH r USING INDEX sqlite_autoindex_recommendations_1 \(id=\?\)/,
  ],
  [
    'the muted templates of each source',
    MUTED_TEMPLATES_SQL,
    [OWNER],
    /SEARCH capture_templates USING INDEX (sqlite_autoindex_capture_templates_1|idx_capture_templates_lookup|idx_capture_templates_seen) \(owner=\?\)/,
  ],
  [
    'list cards',
    LIST_CARDS_SQL,
    [OWNER],
    /SEARCH capture_cards USING INDEX sqlite_autoindex_capture_cards_1 \(owner=\?\)/,
  ],
  [
    'the typed rows a page may duplicate',
    MATCH_CANDIDATES_SQL,
    [OWNER, '2026-10-01', '2026-11-20', '[1250,4590]'],
    /SEARCH t USING INDEX idx_txn_owner_date \(owner=\? AND date>\? AND date<\?\)/,
  ],
  [
    'get a recommendation',
    GET_RECOMMENDATION_SQL,
    [OWNER, 'rec1-1'],
    /SEARCH recommendations USING (INDEX sqlite_autoindex_recommendations_1|PRIMARY KEY) \(id=\?\)/,
  ],
  [
    'decide',
    DECIDE_SQL,
    [OWNER, 'rec1-1', 'dismissed', 0, 'x'],
    /SEARCH recommendations USING (INDEX sqlite_autoindex_recommendations_1|PRIMARY KEY) \(id=\?\)/,
  ],
  [
    'the templates of a title',
    FIND_TEMPLATES_SQL,
    [OWNER, 'iberia', 'title 1', 50],
    /SEARCH capture_templates USING INDEX idx_capture_templates_lookup \(owner=\? AND source=\? AND title=\?\)/,
  ],
  [
    'make room at the template cap',
    EVICT_TEMPLATE_SQL,
    ['e1-1', 500],
    /SEARCH capture_templates USING (COVERING )?INDEX idx_capture_templates_seen \(owner=\?\)/,
  ],
  [
    'a new template',
    INSERT_TEMPLATE_SQL,
    ['e1-1', 'tn', 'title', 'sk', 500],
    /SEARCH e USING INDEX sqlite_autoindex_capture_events_1 \(id=\?\)/,
  ],
  [
    'learn a run',
    LEARN_RUN_SQL,
    ['e1-1', 't1-1', 'sk', 1, 2],
    /SEARCH capture_templates USING INDEX sqlite_autoindex_capture_templates_1 \(owner=\? AND template_id=\?\)/,
  ],
  [
    'count a push',
    SEEN_TEMPLATE_SQL,
    ['e1-1', 't1-1'],
    /SEARCH capture_templates USING INDEX sqlite_autoindex_capture_templates_1 \(owner=\? AND template_id=\?\)/,
  ],
  [
    'count a push of an ignored template',
    SEEN_IGNORED_SQL,
    [OWNER, 't1-1', 'x'],
    /SEARCH capture_templates USING INDEX sqlite_autoindex_capture_templates_1 \(owner=\? AND template_id=\?\)/,
  ],
  [
    'the ignored templates',
    LIST_IGNORED_SQL,
    [OWNER, 100],
    /SEARCH capture_templates USING INDEX (sqlite_autoindex_capture_templates_1|idx_capture_templates_seen) \(owner=\?\)/,
  ],
  [
    'un-ignore a template',
    UNIGNORE_SQL,
    [OWNER, 't1-1'],
    /SEARCH capture_templates USING INDEX sqlite_autoindex_capture_templates_1 \(owner=\? AND template_id=\?\)/,
  ],
  [
    'drop a template that is gone',
    DROP_MISSING_TEMPLATE_SQL,
    ['e1-1'],
    /SEARCH t USING (COVERING )?INDEX sqlite_autoindex_capture_templates_1 \(owner=\? AND template_id=\?\)/,
  ],
  [
    'the open recommendation a push joins',
    RECORD_EVENT_SQL,
    GROUPING_PUSH,
    /SEARCH r USING INDEX idx_recommendations_movement \(owner=\? AND state=\? AND amount_cents=\? AND occurred_at>\? AND occurred_at<\?\)[\s\S]*SEARCH f USING INDEX idx_capture_events_rec \(owner=\? AND rec_id=\?\)/,
  ],
  [
    'the merchant a joining push gives',
    JOIN_MERCHANT_SQL,
    ['e1-1', 'Shop'],
    /SEARCH recommendations USING INDEX sqlite_autoindex_recommendations_1 \(id=\?\)[\s\S]*SEARCH f USING INDEX idx_capture_events_rec \(owner=\? AND rec_id=\?\)/,
  ],
  [
    'blank the text of a decided push',
    BLANK_DECIDED_TEXT_SQL,
    [OWNER, 'rec1-1'],
    /SEARCH capture_events USING INDEX idx_capture_events_rec \(owner=\? AND rec_id=\?\)/,
  ],
  [
    'the push behind a recommendation',
    EVENT_OF_RECOMMENDATION_SQL,
    [OWNER, 'rec1-1'],
    /SEARCH e USING INDEX idx_capture_events_rec \(owner=\? AND rec_id=\?\)[\s\S]*SEARCH t USING INDEX sqlite_autoindex_capture_templates_1 \(owner=\? AND template_id=\?\)/,
  ],
  [
    'teach a template a decision',
    LEARN_DECISION_SQL,
    [OWNER, 't1-1', 1, 0, 0, 4, 'comma', 'expense', null, null, 'rec1-1'],
    /SEARCH capture_templates USING INDEX sqlite_autoindex_capture_templates_1 \(owner=\? AND template_id=\?\)[\s\S]*SEARCH capture_events USING INDEX idx_capture_events_rec \(owner=\? AND rec_id=\?\)/,
  ],
  [
    'vote for a merchant',
    VOTE_MERCHANT_SQL,
    [OWNER, 'rec1-1', 'merchant 1', -1, 'Shop', 2, 'expense', 3, '2026-03-30'],
    /SEARCH capture_events (EXISTS )?USING INDEX idx_capture_events_rec \(owner=\? AND rec_id=\?\)/,
  ],
  [
    'evict merchants past the cap',
    EVICT_MERCHANTS_SQL,
    [OWNER, 2000],
    /SEARCH capture_merchants USING (COVERING )?INDEX idx_capture_merchants_seen \(owner=\?\)/,
  ],
  [
    'the pushes and templates of a page',
    SUGGESTION_EVENTS_SQL,
    [OWNER, '["rec1-1","rec1-2"]'],
    /^SCAN j VIRTUAL TABLE[\s\S]*SEARCH e USING INDEX sqlite_autoindex_capture_events_1 \(id=\?\)[\s\S]*SEARCH capture_events USING INDEX idx_capture_events_rec \(owner=\? AND rec_id=\?\)[\s\S]*SEARCH t USING INDEX sqlite_autoindex_capture_templates_1 \(owner=\? AND template_id=\?\)/,
  ],
  [
    'the merchants of a page',
    MERCHANT_ROWS_SQL,
    [OWNER, '["merchant 1","merchant 2"]'],
    /^SEARCH capture_merchants USING INDEX sqlite_autoindex_capture_merchants_1 \(owner=\? AND key=\?\)/,
  ],
  [
    'record what the person did',
    RECORD_OUTCOME_SQL,
    [OWNER, 'rec1-1', 'dismissed'],
    /SEARCH capture_events USING INDEX idx_capture_events_rec \(owner=\? AND rec_id=\?\)/,
  ],
  [
    'blank text older than 30 days',
    BLANK_OLD_TEXT_SQL,
    ['k1', '2026-03-10'],
    /SEARCH capture_events USING INDEX idx_capture_events_text \(owner=\? AND received_at<\?\)/,
  ],
  [
    'first page of open ones',
    LIST_OPEN_FIRST_SQL,
    [OWNER, 20],
    /SEARCH recommendations USING INDEX idx_recommendations_open \(owner=\? AND state=\?\)/,
  ],
  [
    'next page of open ones',
    LIST_OPEN_AFTER_SQL,
    [OWNER, 20, '2026-03-10', 'rec1-5'],
    /SEARCH recommendations USING INDEX idx_recommendations_open \(owner=\? AND state=\?/,
  ],
]

describe.each([false, true])('capture statement plans, with table statistics: %s', (analyze) => {
  it.each(CASES)('%s uses its index', (_name, sql, params, pattern) => {
    const plan = planOf(seeded(analyze), sql, params)
    expect(plan).toMatch(pattern)
    expect(plan).not.toMatch(/\bSCAN (capture_\w+|recommendations)\b/)
  })

  it('reads counters in key order, with no sort', () => {
    expect(planOf(seeded(analyze), READ_COUNTERS_SQL, [OWNER, '2026-02-01'])).not.toMatch(/TEMP B-TREE/)
  })

  it('reads the templates of a title newest first from the index, with no sort', () => {
    expect(planOf(seeded(analyze), FIND_TEMPLATES_SQL, [OWNER, 'iberia', 'title 1', 50])).not.toMatch(/TEMP B-TREE/)
  })

  it('evicts merchants in the order of the index that holds them, with no sort', () => {
    expect(planOf(seeded(analyze), EVICT_MERCHANTS_SQL, [OWNER, 2000])).not.toMatch(/TEMP B-TREE/)
  })

  it('pages the open list in index order, with no sort', () => {
    const db = seeded(analyze)
    expect(planOf(db, LIST_OPEN_FIRST_SQL, [OWNER, 20])).not.toMatch(/TEMP B-TREE/)
    expect(planOf(db, LIST_OPEN_AFTER_SQL, [OWNER, 20, '2026-03-10', 'rec1-5'])).not.toMatch(/TEMP B-TREE/)
  })

  it('reaches the events and recommendations of a card by their owner, never by scanning them', () => {
    const db = seeded(analyze)
    const bound = [OWNER, 'iberia', 'card', '4821']
    for (const [name, sql, params] of [
      ['link', LINK_CARD_SQL, [...bound, 1]],
      ['point open payments at the link', POINT_OPEN_AT_LINK_SQL, [...bound, 1]],
      ['unlink', UNLINK_CARD_SQL, bound],
      ['clear open payments of an unlinked card', CLEAR_OPEN_OF_UNLINKED_SQL, bound],
      ['waiting cards', WAITING_CARDS_SQL, [OWNER]],
      ['the cards of a page', CARDS_OF_RECOMMENDATIONS_SQL, [OWNER, '["rec1-1"]']],
    ] as const) {
      const plan = planOf(db, sql, [...params])
      expect(plan, name).not.toMatch(/\bSCAN (capture_\w+|recommendations)\b/)
    }
  })

  it('does not scan for a replay or a counter or a card write', () => {
    const db = seeded(analyze)
    const event = ['e', 'k1', 'iberia', 'rx', 'card-purchase', 1, 'EUR', null, null, null, 't', 'd', 0, 't', null, null]
    expect(planOf(db, RECORD_EVENT_SQL, event)).not.toMatch(/\bSCAN capture_events\b/)
    expect(
      planOf(db, RECORD_RECOMMENDATION_SQL, ['e', 'r', null, 1, 'EUR', 't', 'd', null, null, null, 't']),
    ).not.toMatch(/\bSCAN capture_events\b/)
    expect(planOf(db, BUMP_COUNTER_SQL.received, [OWNER, 'iberia', 'd'])).not.toMatch(/\bSCAN capture_counters\b/)
    expect(planOf(db, SAVE_CARD_SQL, [OWNER, 'iberia', 'card', '0000', 1])).not.toMatch(/\bSCAN capture_cards\b/)
    expect(
      planOf(db, CREATE_RECOMMENDATION_SQL, ['r', OWNER, null, 1, 'EUR', 't', 'd', null, null, null, 't']),
    ).not.toMatch(/\bSCAN recommendations\b/)
  })
})
