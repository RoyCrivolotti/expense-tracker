/**
 * Fills `transactions.description_norm` for rows that predate it (migration 0038), a bounded chunk at
 * a time, because the value is the JavaScript `normalizeDesc` and SQL cannot compute it.
 *
 * NULL is the marker for "not filled yet", so the work is resumable and idempotent without any state of
 * its own: each pass takes some of the owner's NULL rows, writes their values, and a row that something
 * else filled in between is left alone (the UPDATE only touches NULL). A pass costs two queries, so a
 * request that runs several stays far inside the 50 a Worker invocation may issue, and its JavaScript
 * is a normalize per row plus one JSON.stringify of a few hundred short strings.
 *
 * Nothing here moves the dataset revision: the column is derived from `description` and appears in no
 * response, so a browser holding the current dataset still holds the current dataset.
 */
import { descriptionNorm } from './descriptionNorm'
import { HttpError } from './http'

/** Rows in one pass. The list travels as one bound JSON string, so this is not limited by the 100 bound values. */
export const BACKFILL_ROWS = 500

/**
 * Characters of JSON in one pass, counted as they travel (a quote or a control character is two). Descriptions
 * written before the length check, or by other tools, can be long, and one bound string should stay small, so a
 * pass stops early rather than send a very large one. The first row always goes, however long, or nothing
 * would ever be filled.
 */
export const BACKFILL_CHARS = 40_000

/** Passes one request makes before it stops and reports what is left. */
export const BACKFILL_PASSES = 4

/**
 * The repair after a rollback. Code from before migration 0038 edits a description without touching
 * `description_norm`, so a row it edited keeps a value that is no longer its own, and nothing recomputes a value
 * that is not NULL. After rolling forward, set the values NULL and the next read that needs them refills them. The
 * second form is for a ledger too large to refill whole; its time is when the rollback began. Then drop the owners'
 * revisions so that a browser holding a cached series is told it changed. docs/DEPLOYMENT.md quotes all three, and a
 * test fails if it stops.
 */
export const REPAIR_ALL_SQL = 'UPDATE transactions SET description_norm = NULL'
export const REPAIR_SINCE_SQL = "UPDATE transactions SET description_norm = NULL WHERE updated_at >= '<when the rollback began, UTC>'"
export const REVISION_RESET_SQL = 'DELETE FROM owner_revision'

export const PENDING_SQL = 'SELECT 1 AS pending FROM transactions WHERE owner = ? AND description_norm IS NULL LIMIT 1'

/**
 * No ORDER BY: the waiting rows come off the index in its own order (by date, then id), which is stable, so
 * a run that stops resumes where it left off. Asking for id order made SQLite walk every row of the owner
 * through `idx_txn_owner` to avoid a sort, which reads the whole ledger when nothing is waiting.
 */
export const PENDING_ROWS_SQL =
  'SELECT id, description FROM transactions WHERE owner = ? AND description_norm IS NULL LIMIT ?'

/**
 * The `+` in front of the target's columns is deliberate. Without it SQLite visits the owner's waiting rows
 * first and scans the whole JSON list once for each of them, so a pass of 500 reads about 250,000 rows on
 * D1 (200 rows read 40,600, measured). With it the only usable constraint on `transactions` is the row id,
 * so the JSON list is the outer loop and each pair is one primary key lookup: four rows read per row filled.
 * The owner and NULL tests still apply, to the row found, so a row filled by something else is left alone.
 */
export const FILL_SQL = `UPDATE transactions SET description_norm = j.norm
  FROM (SELECT json_extract(value, '$[0]') AS id, json_extract(value, '$[1]') AS norm FROM json_each(?2)) AS j
  WHERE transactions.id = j.id AND +transactions.owner = ?1 AND +transactions.description_norm IS NULL`

export interface BackfillLimits {
  rows?: number
  chars?: number
  passes?: number
}

export interface BackfillResult {
  /** Rows written by this call. */
  filled: number
  /** Whether the owner still has rows waiting for a value. */
  pending: boolean
}

export async function hasPendingDescriptionNorm(db: D1Database, owner: string): Promise<boolean> {
  return (await db.prepare(PENDING_SQL).bind(owner).first()) !== null
}

/** The next rows to fill with their values, as `[id, norm]` pairs, never past `chars` unless that takes the first row. */
async function nextPairs(db: D1Database, owner: string, rows: number, chars: number): Promise<Array<[number, string]>> {
  const { results } = await db.prepare(PENDING_ROWS_SQL).bind(owner, rows).all<{ id: number; description: string }>()
  const pairs: Array<[number, string]> = []
  let size = 0
  for (const row of results ?? []) {
    const pair: [number, string] = [row.id, descriptionNorm(row.description)]
    const weight = JSON.stringify(pair).length + 1
    if (pairs.length > 0 && size + weight > chars) break
    size += weight
    pairs.push(pair)
  }
  return pairs
}

export async function fillDescriptionNorm(
  db: D1Database,
  owner: string,
  { rows = BACKFILL_ROWS, chars = BACKFILL_CHARS, passes = BACKFILL_PASSES }: BackfillLimits = {},
): Promise<BackfillResult> {
  let filled = 0
  for (let pass = 0; pass < passes; pass += 1) {
    const pairs = await nextPairs(db, owner, rows, chars)
    if (pairs.length === 0) return { filled, pending: false }
    const result = await db.prepare(FILL_SQL).bind(owner, JSON.stringify(pairs)).run()
    filled += result.meta?.changes ?? 0
  }
  return { filled, pending: await hasPendingDescriptionNorm(db, owner) }
}

/**
 * Makes sure no row of the owner is still waiting for its value before a read that groups or searches by
 * `description_norm`, and answers 503 with a `Retry-After` while some are: grouping before then would leave
 * rows out. Each request makes progress, so a retry gets further.
 */
export async function ensureDescriptionNorm(db: D1Database, owner: string): Promise<void> {
  const { pending } = await fillDescriptionNorm(db, owner)
  if (pending) {
    throw new HttpError(503, 'The description index is still being built. Try again in a moment.', { 'Retry-After': '1' })
  }
}
