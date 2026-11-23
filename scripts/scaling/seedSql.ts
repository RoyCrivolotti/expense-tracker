/**
 * The statements that put a synthetic ledger into a shared database under the synthetic owner, and nothing
 * else. Every row is inserted from one bound JSON string (`json_each`), so the 100 bound-parameter limit
 * never applies and a chunk of 500 rows is a single statement. Ids are a block above what the database
 * already holds, so they cannot collide with anyone's rows, and no explicit id jumps a sequence by more than
 * the block.
 */
import type { ExpenseDataset } from '../../src/domain/types'
import { normalizeDesc } from '../../src/domain/engine/recurringDetect'
import { insertWrites, LABEL_LINK_WRITES } from './budget'
import { SYNTHETIC_OWNER } from './guard'
import { reference } from './seedReferenceSql'
import { bit, ID_TABLES, jsonInsert, type IdBases, type SeedStep } from './seedStatement'
import type { Transport } from './transport'

export const CHUNK = 500
/** The first chunk of transactions is small, so one cheap statement shows what D1 counts per row. */
export const CALIBRATION_ROWS = 20
/** Ids start this far above the largest one the table holds. */
export const ID_HEADROOM = 1_000

function chunks<T>(
  items: T[],
  first?: number,
): T[][] {
  const out: T[][] = []
  let at = 0
  let size = first ?? CHUNK
  while (at < items.length) {
    out.push(items.slice(at, at + size))
    at += size
    size = CHUNK
  }
  return out
}

/** The largest id in each table the ledger writes to, from which the id blocks start. */
export async function readIdBases(transport: Transport): Promise<IdBases> {
  const bases = {} as IdBases
  for (const table of ID_TABLES) {
    const reply = await transport.query({ sql: `SELECT COALESCE(MAX(id), 0) AS top FROM ${table}`, params: [] })
    bases[table] = Number(reply.results[0]?.top ?? 0) + ID_HEADROOM
  }
  return bases
}

const TXN_COLUMNS = [
  'id',
  'date',
  'budget_month',
  'description',
  'description_norm',
  'account_id',
  'category_id',
  'type',
  'amount_cents',
  'cancelled',
  'notes',
  'created_at',
  'plan_id',
  'installment_index',
  'flag_id',
  'settled_by',
  'report_count',
  'report_covered_cents',
]

function transactions(
  d: ExpenseDataset,
  b: IdBases,
): SeedStep[] {
  const rows = d.transactions.map((t) => ({
    row: t,
    json: {
      id: b.transactions + t.id,
      date: t.date,
      budget_month: t.budgetMonth,
      description: t.description,
      description_norm: normalizeDesc(t.description),
      account_id: b.accounts + t.accountId,
      category_id: b.categories + t.categoryId,
      type: t.type,
      amount_cents: t.amountCents,
      cancelled: bit(t.cancelled),
      notes: t.notes ?? null,
      created_at: t.createdAt ?? `${t.date}T00:00:00Z`,
      plan_id: t.planId == null ? null : b.installment_plans + t.planId,
      installment_index: t.installmentIndex ?? null,
      flag_id: t.flagId == null ? null : b.flags + t.flagId,
      settled_by: t.settledBy == null ? null : b.transactions + t.settledBy,
      report_count: t.reportCount ?? null,
      report_covered_cents: t.reportCoveredCents ?? null,
    },
  }))
  return chunks(rows, CALIBRATION_ROWS).map((part) => ({
    statement: jsonInsert(
      'transactions',
      TXN_COLUMNS,
      part.map((p) => p.json),
    ),
    table: 'transactions',
    rows: part.length,
    expectedWritten: part.reduce((sum, p) => sum + insertWrites(p.row), 0),
  }))
}

function labelLinks(
  d: ExpenseDataset,
  b: IdBases,
): SeedStep[] {
  const links = d.transactions.flatMap((t) =>
    (t.labelIds ?? []).map((labelId) => ({ t: b.transactions + t.id, l: b.labels + labelId })),
  )
  return chunks(links).map((part) => ({
    statement: {
      sql:
        'INSERT INTO transaction_labels (transaction_id, label_id) ' +
        "SELECT json_extract(value, '$.t'), json_extract(value, '$.l') FROM json_each(?2) " +
        "WHERE EXISTS (SELECT 1 FROM transactions WHERE id = json_extract(value, '$.t') AND owner = ?1)",
      params: [SYNTHETIC_OWNER, JSON.stringify(part)],
    },
    table: 'transaction_labels',
    rows: part.length,
    expectedWritten: part.length * LABEL_LINK_WRITES,
  }))
}

/**
 * The owner's revision row, so that a read does not have to create it and a read that writes is visible as
 * a finding rather than expected.
 */
function revision(): SeedStep {
  return {
    statement: {
      sql: 'INSERT INTO owner_revision (owner, token) VALUES (?1, lower(hex(randomblob(8)))) ON CONFLICT(owner) DO NOTHING',
      params: [SYNTHETIC_OWNER],
    },
    table: 'owner_revision',
    rows: 1,
  }
}

/** Every statement of the seed, in an order the foreign keys allow. */
export function seedSteps(
  dataset: ExpenseDataset,
  bases: IdBases,
): SeedStep[] {
  return [...reference(dataset, bases), ...transactions(dataset, bases), ...labelLinks(dataset, bases), revision()]
}
