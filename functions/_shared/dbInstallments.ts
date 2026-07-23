import type { NewInstallmentPlan } from '../domain/data/dataSource'
import type { InstallmentPlan } from '../domain/types'
import type { Env } from './env'
import { HttpError } from './http'
import { assertOwnedAccount, assertOwnedCategory } from './ownership'
import { toInstallmentPlan, type InstallmentPlanRow } from './rows'

type ColumnMap = Record<keyof NewInstallmentPlan, string>

const PLAN_COLUMNS: ColumnMap = {
  description: 'description',
  totalCount: 'total_count',
  amountCents: 'amount_cents',
  accountId: 'account_id',
  categoryId: 'category_id',
  type: 'type',
  anchorBudgetMonth: 'anchor_budget_month',
  startInstallmentIndex: 'start_installment_index',
  dueDayOfMonth: 'due_day_of_month',
  active: 'active',
}

function coerce(key: keyof NewInstallmentPlan, value: unknown): unknown {
  if (key === 'active') return value ? 1 : 0
  return value ?? null
}

export async function createInstallmentPlan(
  env: Env,
  owner: string,
  input: NewInstallmentPlan,
): Promise<InstallmentPlan> {
  await assertOwnedAccount(env, owner, input.accountId)
  await assertOwnedCategory(env, owner, input.categoryId)
  const row = await env.DB.prepare(
    `INSERT INTO installment_plans
       (owner, description, total_count, amount_cents, account_id, category_id, type,
        anchor_budget_month, start_installment_index, due_day_of_month, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      owner,
      input.description,
      input.totalCount,
      input.amountCents,
      input.accountId,
      input.categoryId,
      input.type,
      input.anchorBudgetMonth,
      input.startInstallmentIndex,
      input.dueDayOfMonth ?? null,
      input.active ? 1 : 0,
    )
    .first<InstallmentPlanRow>()
  if (!row) throw new HttpError(500, 'Installment plan insert failed')
  return toInstallmentPlan(row)
}

export async function updateInstallmentPlan(
  env: Env,
  owner: string,
  id: number,
  patch: Partial<NewInstallmentPlan>,
): Promise<InstallmentPlan> {
  const keys = (Object.keys(patch) as (keyof NewInstallmentPlan)[]).filter((k) => k in PLAN_COLUMNS)
  if (keys.length === 0) throw new HttpError(400, 'Empty patch')
  if (patch.accountId != null) await assertOwnedAccount(env, owner, patch.accountId)
  if (patch.categoryId != null) await assertOwnedCategory(env, owner, patch.categoryId)
  const sets = keys.map((k) => `${PLAN_COLUMNS[k]} = ?`).concat("updated_at = datetime('now')")
  const values = keys.map((k) => coerce(k, patch[k]))
  const row = await env.DB.prepare(
    `UPDATE installment_plans SET ${sets.join(', ')} WHERE id = ? AND owner = ? RETURNING *`,
  )
    .bind(...values, id, owner)
    .first<InstallmentPlanRow>()
  if (!row) throw new HttpError(404, 'Installment plan not found')
  return toInstallmentPlan(row)
}

export async function deleteInstallmentPlan(env: Env, owner: string, id: number): Promise<void> {
  const result = await env.DB.prepare('DELETE FROM installment_plans WHERE id = ? AND owner = ?')
    .bind(id, owner)
    .run()
  if ((result.meta.changes ?? 0) === 0) throw new HttpError(404, 'Installment plan not found')
}
