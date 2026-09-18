/**
 * Auto-create a deferred (credit card) installment plan's due transactions.
 *
 * A credit-card installment's monthly charge is a silent, deterministic certainty
 * from the day the plan is created — nothing the app learns by waiting for a user
 * to click "+". A debit-card installment is the opposite: logging it is the only
 * signal the app ever gets that the money actually left the account, so those
 * plans are deliberately left untouched here and stay manual.
 *
 * Runs lazily from loadDataset on every load, so it self-heals if the app isn't
 * opened for months — every missing month is created in one pass, oldest first.
 */
import type { Env } from './env'
import type { InstallmentPlan, StoredTransaction } from '../domain/types'
import { nextInstallmentSuggestion, type InstallmentSuggestion } from '../domain/engine/installments'
import { defaultBudgetMonth, monthsBetweenBudget, DEFAULT_BUDGET_ROLLOVER_DAY } from '../domain/engine/dates'
import { maybeCompletePlan } from './dbWrite'
import { toInstallmentPlan, toStoredTxn, type InstallmentPlanRow, type TxnRow } from './rows'

/**
 * Insert one backfilled installment, atomically no-oping if it already exists.
 *
 * Deliberately not `insertTransaction` from dbWrite.ts: that path's duplicate
 * pre-check is check-then-throw, not atomic with the insert, and it must keep
 * throwing a real 400 for a genuine accidental duplicate from the manual "+"
 * flow — weakening that for a backfill race isn't worth the risk. `ON CONFLICT
 * DO NOTHING` is the same idiom this file's sibling already uses for
 * setStatementPaid/setCashActual, and closes the race atomically.
 *
 * Skips re-validating account/category ownership: an installment plan's
 * account_id/category_id can never dangle or belong to another owner —
 * dbConfig.ts's deleteAccount/deleteCategory always either block the delete
 * while any installment_plans row references them, or reassign the plan's
 * column in the same batch.
 */
async function insertBackfillRow(
  env: Env,
  owner: string,
  suggestion: InstallmentSuggestion,
): Promise<TxnRow | null> {
  return env.DB.prepare(
    `INSERT INTO transactions
       (owner, date, budget_month, description, account_id, category_id, type, amount_cents, cancelled, plan_id, installment_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(owner, plan_id, installment_index)
       WHERE plan_id IS NOT NULL AND installment_index IS NOT NULL
     DO NOTHING
     RETURNING *`,
  )
    .bind(
      owner,
      suggestion.predictedDate,
      suggestion.budgetMonth,
      suggestion.description,
      suggestion.accountId,
      suggestion.categoryId,
      suggestion.type,
      suggestion.amountCents,
      suggestion.planId,
      suggestion.installmentIndex,
    )
    .first<TxnRow>()
}

async function backfillPlan(
  env: Env,
  owner: string,
  plan: InstallmentPlan,
  initialTxns: StoredTransaction[],
  currentBudgetMonth: string,
): Promise<void> {
  let txns = initialTxns
  let inserted = false
  let suggestion = nextInstallmentSuggestion(plan, txns)
  while (suggestion && monthsBetweenBudget(suggestion.budgetMonth, currentBudgetMonth) >= 0) {
    const row = await insertBackfillRow(env, owner, suggestion)
    if (!row) break // another request already backfilled this index
    txns = [...txns, toStoredTxn(row)]
    inserted = true
    suggestion = nextInstallmentSuggestion(plan, txns)
  }
  if (inserted) await maybeCompletePlan(env, owner, plan.id)
}

export async function backfillInstallments(env: Env, owner: string): Promise<void> {
  const { results: planRows } = await env.DB.prepare(
    `SELECT p.* FROM installment_plans p
     JOIN accounts a ON a.id = p.account_id AND a.owner = p.owner
     WHERE p.owner = ? AND p.active = 1 AND a.settlement = 'deferred'`,
  )
    .bind(owner)
    .all<InstallmentPlanRow>()
  const plans = (planRows ?? []).map(toInstallmentPlan)
  if (plans.length === 0) return

  const placeholders = plans.map(() => '?').join(', ')
  const { results: txnRows } = await env.DB.prepare(
    `SELECT * FROM transactions WHERE owner = ? AND plan_id IN (${placeholders})`,
  )
    .bind(owner, ...plans.map((p) => p.id))
    .all<TxnRow>()
  const txnsByPlan = new Map<number, StoredTransaction[]>()
  for (const row of txnRows ?? []) {
    const stored = toStoredTxn(row)
    if (stored.planId == null) continue
    const list = txnsByPlan.get(stored.planId) ?? []
    list.push(stored)
    txnsByPlan.set(stored.planId, list)
  }

  // Budget month, not calendar month — an owner with a rollover day past the
  // 1st (settings.budgetRolloverDay) can already be in next month's budget
  // while the calendar still reads this month. Using the raw calendar month
  // here would leave a plan's next installment stuck until the calendar
  // catches up, days or weeks after the rest of the app (and a manual "+")
  // would already treat it as due.
  const settingsRow = await env.DB.prepare(
    'SELECT budget_rollover_day FROM settings WHERE owner = ?',
  )
    .bind(owner)
    .first<{ budget_rollover_day: number | null }>()
  const rolloverDay = settingsRow?.budget_rollover_day ?? DEFAULT_BUDGET_ROLLOVER_DAY
  // Server clock (UTC), not the user's local one — right at a day boundary
  // this can disagree with the user's calendar by up to a day. Matches existing
  // ad hoc `new Date()` usage elsewhere in functions/ (backupService.ts,
  // accessService.ts); not worth a shared clock for a personal expense tracker.
  const todayIso = new Date().toISOString().slice(0, 10)
  const currentBudgetMonth = defaultBudgetMonth(todayIso, rolloverDay)

  for (const plan of plans) {
    try {
      await backfillPlan(env, owner, plan, txnsByPlan.get(plan.id) ?? [], currentBudgetMonth)
    } catch (err) {
      console.error('installment backfill failed for plan', plan.id, err)
    }
  }
}
