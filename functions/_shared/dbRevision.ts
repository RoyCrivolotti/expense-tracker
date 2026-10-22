/**
 * The per-owner revision behind the weak ETag on GET /api/expenses.
 *
 * `owner_revision.token` is opaque and random, and is replaced by every write that can change what
 * `loadDataset` returns. A reader who still holds the current token, in the same budget month, has the
 * current dataset. See docs/ARCHITECTURE.md, "Dataset revision", for where the writes are covered.
 */
import { DEFAULT_BUDGET_ROLLOVER_DAY, defaultBudgetMonth } from '../domain/engine/dates'
import { datasetEtag } from './datasetEtag'

/** What a conditional read is compared against: the owner's token, and the budget month it was read in. */
export interface OwnerRevision {
  token: string
  budgetMonth: string
}

/**
 * The owner's current budget month by the server's clock (UTC) and their rollover day. The installment
 * backfill and the ETag must agree on it: a new month is what makes the backfill insert rows.
 */
export function serverBudgetMonth(
  rolloverDay: number | null | undefined,
  now: Date = new Date(),
): string {
  return defaultBudgetMonth(
    now.toISOString().slice(0, 10),
    rolloverDay ?? DEFAULT_BUDGET_ROLLOVER_DAY,
  )
}

const NEW_TOKEN = 'lower(hex(randomblob(8)))'

function bumpStatement(db: D1Database, owner: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO owner_revision (owner, token) VALUES (?, ${NEW_TOKEN})
       ON CONFLICT(owner) DO UPDATE SET token = excluded.token`,
    )
    .bind(owner)
}

/** Replace the owner's token with a fresh random one, creating the row if there is none. */
export async function bumpRevision(db: D1Database, owner: string): Promise<void> {
  await bumpStatement(db, owner).run()
}

/**
 * {@link bumpRevision}, returning the token it replaced (null when the owner had none). The read and the
 * replacement are one batch, so nothing can move the token between them: the value returned is what the
 * ledger was at the moment this request began, which is what a write that names the revision it was
 * based on (`expectedRevision`) has to be compared with.
 */
export async function bumpRevisionReadingPrevious(db: D1Database, owner: string): Promise<string | null> {
  const [previous] = await db.batch([
    db.prepare('SELECT token FROM owner_revision WHERE owner = ?').bind(owner),
    bumpStatement(db, owner),
  ])
  return (previous?.results?.[0] as { token: string } | undefined)?.token ?? null
}

/** The owner's token, creating one if the owner has none yet. Never replaces an existing one. */
async function ensureRevision(db: D1Database, owner: string): Promise<string> {
  const row = await db
    .prepare(
      `INSERT INTO owner_revision (owner, token) VALUES (?, ${NEW_TOKEN})
       ON CONFLICT(owner) DO UPDATE SET owner = excluded.owner
       RETURNING token`,
    )
    .bind(owner)
    .first<{ token: string }>()
  if (!row) throw new Error('owner_revision returned no row')
  return row.token
}

/**
 * The owner's revision as it stands. One statement reads the token and the rollover day (a row each),
 * so an unchanged ledger costs two rows read; only an owner with no token yet pays a write.
 *
 * Call this before reading the data it describes. A write that lands in between makes the token older
 * than the data, so the next request misses and reloads. Reading it after could pair a newer token with
 * older data, and that pair would be served from cache until the next write.
 */
export async function readOwnerRevision(
  db: D1Database,
  owner: string,
  now: Date = new Date(),
): Promise<OwnerRevision> {
  const row = await db
    .prepare(
      `SELECT (SELECT token FROM owner_revision WHERE owner = ?) AS token,
              (SELECT budget_rollover_day FROM settings WHERE owner = ?) AS rollover_day`,
    )
    .bind(owner, owner)
    .first<{ token: string | null; rollover_day: number | null }>()
  const token = row?.token ?? (await ensureRevision(db, owner))
  return { token, budgetMonth: serverBudgetMonth(row?.rollover_day, now) }
}

/** The ETag for the dataset as it stands; see {@link readOwnerRevision} for when to call it. */
export async function readDatasetEtag(
  db: D1Database,
  owner: string,
  now: Date = new Date(),
): Promise<string> {
  const { token, budgetMonth } = await readOwnerRevision(db, owner, now)
  return datasetEtag(token, budgetMonth)
}
