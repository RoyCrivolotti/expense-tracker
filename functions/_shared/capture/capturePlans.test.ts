/**
 * Every statement capture runs must reach its rows through an index that starts with the owner (or the key), and
 * never scan a table that grows or sort a page the index already orders. D1 bills the rows SQLite visits, and a
 * captured push is one of the most frequent writes the app will see. Run with and without table statistics, with
 * several owners present, because a planner with no statistics picks differently.
 */
import { describe, expect, it } from 'vitest'
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
  BUMP_COUNTER_SQL,
  EVENTS_SINCE_SQL,
  LAST_CAPTURE_SQL,
  LIST_CARDS_SQL,
  READ_COUNTERS_SQL,
  RECORD_EVENT_SQL,
  RECORD_RECOMMENDATION_SQL,
  SAVE_CARD_SQL,
} from './captureEventsSql'
import { CREATE_KEY_SQL, FIND_KEY_SQL, LIST_KEYS_SQL, REVOKE_KEY_SQL, TOUCH_KEY_SQL } from './captureKeysSql'
import {
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
        `INSERT INTO capture_events (id, owner, key_id, source, replay_key, kind, occurred_at, local_date, offset_minutes, received_at)
         VALUES (?, ?, ?, 'iberia', ?, 'card-purchase', '2026-03-01', '2026-03-01', 60, ?)`,
      ).run(`e${o}-${i}`, owner, `k${o}`, `r${o}-${i}`, `2026-03-${String(1 + (i % 28)).padStart(2, '0')}`)
      db.prepare(
        `INSERT INTO recommendations (id, owner, occurred_at, local_date, created_at) VALUES (?, ?, '2026-03-01', ?, '2026-03-01')`,
      ).run(`rec${o}-${i}`, owner, `2026-03-${String(1 + (i % 28)).padStart(2, '0')}`)
      db.prepare("INSERT INTO capture_counters (owner, source, day) VALUES (?, 'iberia', ?)").run(
        owner,
        `2026-02-${String(1 + (i % 28)).padStart(2, '0')}-${i}`,
      )
    }
  }
  if (analyze) db.exec('ANALYZE')
  return db
}

const OWNER = 'owner1@example.com'
const planOf = (db: ReturnType<typeof seeded>, sql: string, params: Array<string | number>): string => {
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params)
  return rows.map((r) => String(r.detail)).join('\n')
}

// [name, sql, params, a pattern every plan must match]
const CASES: Array<[string, string, Array<string | number>, RegExp]> = [
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
    'list cards',
    LIST_CARDS_SQL,
    [OWNER],
    /SEARCH capture_cards USING INDEX sqlite_autoindex_capture_cards_1 \(owner=\?\)/,
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
    const event = [
      'e',
      'k1',
      'iberia',
      'rx',
      'card-purchase',
      1,
      'EUR',
      null,
      null,
      null,
      't',
      'd',
      0,
      't',
      null,
      null,
    ]
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
