import type { StoredTransaction, Transaction } from '../domain/types'
import type { NewTransaction } from '../domain/data/dataSource'
import { deriveStatus } from '../domain/engine/status'
import { parseIsoDate } from '../domain/engine/dates'
import type { Env } from './env'
import {
  toAccount,
  toCashActual,
  toStatement,
  toStoredTxn,
  type AccountRow,
  type CashActualRow,
  type StatementRow,
  type TxnRow,
} from './rows'
import { HttpError } from './http'
import { assertOwnedAccount, assertOwnedCategory, assertOwnedPlan } from './ownership'

async function deriveOne(env: Env, owner: string, stored: StoredTransaction): Promise<Transaction> {
  const acc = await env.DB.prepare('SELECT * FROM accounts WHERE id = ? AND owner = ?')
    .bind(stored.accountId, owner)
    .first<AccountRow>()
  const stmt = await env.DB.prepare(
    'SELECT * FROM account_statements WHERE account_id = ? AND year_month = ? AND owner = ?',
  )
    .bind(stored.accountId, stored.budgetMonth, owner)
    .first<StatementRow>()
  const account = acc ? toAccount(acc) : undefined
  const statements = stmt ? [toStatement(stmt)] : []
  const status = account ? deriveStatus(stored, account, statements) : 'posted'
  return { ...stored, status }
}

interface PlanLinkInput {
  planId?: number | null
  installmentIndex?: number
}

/**
 * Resolve the installment link for a plan-bound write. The index is
 * server-assigned from recorded progress unless one is supplied explicitly;
 * duplicates are rejected before the write so a clear 400 is returned instead
 * of a unique-index failure. On update, `excludeId` skips the row being saved
 * so re-saving it at its own index (or moving plans) is allowed.
 */
async function resolvePlanLink(
  env: Env,
  owner: string,
  input: PlanLinkInput,
  excludeId?: number,
): Promise<{ planId: number; installmentIndex: number } | null> {
  if (input.planId == null) return null
  await assertOwnedPlan(env, owner, input.planId)
  const start = await env.DB.prepare(
    'SELECT start_installment_index AS s FROM installment_plans WHERE id = ? AND owner = ?',
  )
    .bind(input.planId, owner)
    .first<{ s: number }>()
  const guard = excludeId != null ? ' AND id != ?' : ''
  const maxArgs = excludeId != null ? [owner, input.planId, excludeId] : [owner, input.planId]
  const max = await env.DB.prepare(
    `SELECT MAX(installment_index) AS m FROM transactions WHERE owner = ? AND plan_id = ?${guard}`,
  )
    .bind(...maxArgs)
    .first<{ m: number | null }>()
  const nextIndex = max?.m != null ? max.m + 1 : (start?.s ?? 1)
  const installmentIndex = input.installmentIndex ?? nextIndex
  const dupArgs =
    excludeId != null
      ? [owner, input.planId, installmentIndex, excludeId]
      : [owner, input.planId, installmentIndex]
  const dup = await env.DB.prepare(
    `SELECT 1 AS ok FROM transactions WHERE owner = ? AND plan_id = ? AND installment_index = ?${guard}`,
  )
    .bind(...dupArgs)
    .first<{ ok: number }>()
  if (dup) throw new HttpError(400, 'Installment already recorded for this index')
  return { planId: input.planId, installmentIndex }
}

export async function insertTransaction(
  env: Env,
  owner: string,
  input: NewTransaction,
): Promise<Transaction> {
  await assertOwnedAccount(env, owner, input.accountId)
  await assertOwnedCategory(env, owner, input.categoryId)
  const planLink = await resolvePlanLink(env, owner, input)
  const row = await env.DB.prepare(
    `INSERT INTO transactions
       (owner, date, budget_month, description, account_id, category_id, type, amount_cents, cancelled, notes, plan_id, installment_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      owner,
      input.date,
      input.budgetMonth,
      input.description,
      input.accountId,
      input.categoryId,
      input.type,
      input.amountCents,
      input.cancelled ? 1 : 0,
      input.notes ?? null,
      planLink?.planId ?? null,
      planLink?.installmentIndex ?? null,
    )
    .first<TxnRow>()
  if (!row) throw new HttpError(500, 'Insert failed')
  return deriveOne(env, owner, toStoredTxn(row))
}

// Plan link columns are patched through a dedicated path (planLinkColumns), not
// the generic COLUMN map, so the schedule/index invariants stay centralised in
// resolvePlanLink for both insert and update.
type PatchableTxnKey = Exclude<keyof NewTransaction, 'planId' | 'installmentIndex'>

const COLUMN: Record<PatchableTxnKey, string> = {
  date: 'date',
  budgetMonth: 'budget_month',
  description: 'description',
  accountId: 'account_id',
  categoryId: 'category_id',
  type: 'type',
  amountCents: 'amount_cents',
  cancelled: 'cancelled',
  notes: 'notes',
}

function patchValue(key: PatchableTxnKey, value: unknown): unknown {
  if (key === 'cancelled') return value ? 1 : 0
  return value ?? null
}

/**
 * Column assignments for an update's plan link. Absent `planId` means no change;
 * an explicit `null` unlinks; a plan id links/moves (index resolved, self-excluded).
 */
async function planLinkColumns(
  env: Env,
  owner: string,
  id: number,
  patch: Partial<NewTransaction>,
): Promise<{ sets: string[]; values: unknown[] }> {
  if (!('planId' in patch)) return { sets: [], values: [] }
  const cols = ['plan_id = ?', 'installment_index = ?']
  if (patch.planId == null) return { sets: cols, values: [null, null] }
  const link = await resolvePlanLink(
    env,
    owner,
    {
      planId: patch.planId,
      ...(patch.installmentIndex != null ? { installmentIndex: patch.installmentIndex } : {}),
    },
    id,
  )
  return { sets: cols, values: [link!.planId, link!.installmentIndex] }
}

export async function updateTransaction(
  env: Env,
  owner: string,
  id: number,
  patch: Partial<NewTransaction>,
): Promise<Transaction> {
  const keys = (Object.keys(patch) as PatchableTxnKey[]).filter((k) => k in COLUMN)
  const link = await planLinkColumns(env, owner, id, patch)
  if (keys.length === 0 && link.sets.length === 0) throw new HttpError(400, 'Empty patch')
  if (patch.accountId != null) await assertOwnedAccount(env, owner, patch.accountId)
  if (patch.categoryId != null) await assertOwnedCategory(env, owner, patch.categoryId)
  const sets = keys
    .map((k) => `${COLUMN[k]} = ?`)
    .concat(link.sets, "updated_at = datetime('now')")
  const values = keys.map((k) => patchValue(k, patch[k])).concat(link.values)
  const row = await env.DB.prepare(
    `UPDATE transactions SET ${sets.join(', ')} WHERE id = ? AND owner = ? RETURNING *`,
  )
    .bind(...values, id, owner)
    .first<TxnRow>()
  if (!row) throw new HttpError(404, 'Transaction not found')
  return deriveOne(env, owner, toStoredTxn(row))
}

export async function deleteTransaction(env: Env, owner: string, id: number): Promise<void> {
  const result = await env.DB.prepare('DELETE FROM transactions WHERE id = ? AND owner = ?')
    .bind(id, owner)
    .run()
  if ((result.meta.changes ?? 0) === 0) throw new HttpError(404, 'Transaction not found')
}

/** Insert many transactions; each row is validated and status-derived like insertTransaction. */
export async function bulkInsertTransactions(
  env: Env,
  owner: string,
  inputs: NewTransaction[],
): Promise<Transaction[]> {
  const saved: Transaction[] = []
  for (const input of inputs) {
    saved.push(await insertTransaction(env, owner, input))
  }
  return saved
}

/** Delete many rows in one statement; only ids owned by `owner` are removed. */
export async function deleteTransactions(env: Env, owner: string, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0
  const placeholders = ids.map(() => '?').join(', ')
  const result = await env.DB.prepare(
    `DELETE FROM transactions WHERE owner = ? AND id IN (${placeholders})`,
  )
    .bind(owner, ...ids)
    .run()
  return result.meta.changes ?? 0
}

export async function setStatementPaid(
  env: Env,
  owner: string,
  accountId: number,
  yearMonth: string,
  paid: boolean,
  paidOn?: string,
) {
  await assertOwnedAccount(env, owner, accountId)
  let paidOnValue: string | null = null
  if (paid) {
    if (!paidOn) throw new HttpError(400, 'paidOn is required when paid is true')
    const parsed = parseIsoDate(paidOn)
    if (!parsed) throw new HttpError(400, 'paidOn must be YYYY-MM-DD')
    paidOnValue = parsed
  }
  const row = await env.DB.prepare(
    `INSERT INTO account_statements (owner, account_id, year_month, paid, paid_on)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(owner, account_id, year_month) DO UPDATE SET paid = excluded.paid, paid_on = excluded.paid_on
     RETURNING *`,
  )
    .bind(owner, accountId, yearMonth, paid ? 1 : 0, paidOnValue)
    .first<StatementRow>()
  if (!row) throw new HttpError(500, 'Statement upsert failed')
  return toStatement(row)
}

export async function setCashActual(
  env: Env,
  owner: string,
  yearMonth: string,
  actualCashCents: number,
) {
  const row = await env.DB.prepare(
    `INSERT INTO cash_actuals (owner, year_month, actual_cash_cents, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(owner, year_month) DO UPDATE SET
       actual_cash_cents = excluded.actual_cash_cents, updated_at = excluded.updated_at
     RETURNING *`,
  )
    .bind(owner, yearMonth, actualCashCents)
    .first<CashActualRow>()
  if (!row) throw new HttpError(500, 'Cash actual upsert failed')
  return toCashActual(row)
}

/** Remove a recorded actual-cash balance (empty input in the UI). */
export async function clearCashActual(env: Env, owner: string, yearMonth: string): Promise<void> {
  await env.DB.prepare('DELETE FROM cash_actuals WHERE year_month = ? AND owner = ?')
    .bind(yearMonth, owner)
    .run()
}
