import type { Category } from '../domain/types'
import type { DeleteCategoryOptions, DeleteCategoryResult, NewCategory } from '../domain/data/dataSource'
import { buildUpdate, type ColumnMap, type Coerce } from './dbUpdate'
import type { Env } from './env'
import { HttpError } from './http'
import { assertOwnedCategory } from './ownership'
import { toCategory, type CategoryRow } from './rows'

const CATEGORY_COLUMNS: ColumnMap<NewCategory> = {
  name: 'name',
  monthlyBudgetCents: 'monthly_budget_cents',
  sortOrder: 'sort_order',
  icon: 'icon',
  color: 'color',
  active: 'active',
}
const coerceCategory: Coerce<NewCategory> = (
  key,
  value,
) => (key === 'active' ? (value ? 1 : 0) : (value ?? null))

export async function createCategory(
  env: Env,
  owner: string,
  input: NewCategory,
): Promise<Category> {
  const row = await env.DB.prepare(
    `INSERT INTO categories (owner, name, monthly_budget_cents, sort_order, icon, color, active)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      owner,
      input.name,
      input.monthlyBudgetCents,
      input.sortOrder,
      input.icon ?? null,
      input.color ?? null,
      input.active ? 1 : 0,
    )
    .first<CategoryRow>()
  if (!row) throw new HttpError(500, 'Category insert failed')
  return toCategory(row)
}

export async function updateCategory(
  env: Env,
  owner: string,
  id: number,
  patch: Partial<NewCategory>,
): Promise<Category> {
  const { sets, values } = buildUpdate(CATEGORY_COLUMNS, patch, coerceCategory)
  const row = await env.DB.prepare(`UPDATE categories SET ${sets} WHERE id = ? AND owner = ? RETURNING *`)
    .bind(...values, id, owner)
    .first<CategoryRow>()
  if (!row) throw new HttpError(404, 'Category not found')
  return toCategory(row)
}

async function countCategoryUsage(
  env: Env,
  owner: string,
  id: number,
): Promise<number> {
  const [txns, plans] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS n FROM transactions WHERE category_id = ? AND owner = ?')
      .bind(id, owner)
      .first<{ n: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM installment_plans WHERE category_id = ? AND owner = ?')
      .bind(id, owner)
      .first<{ n: number }>(),
  ])
  return (txns?.n ?? 0) + (plans?.n ?? 0)
}

/** Forgets a category as the one investments are filed under, when it is. */
function clearInvestmentCategory(
  env: Env,
  owner: string,
  id: number,
) {
  return env.DB.prepare(
    'UPDATE settings SET investment_category_id = NULL WHERE owner = ? AND investment_category_id = ?',
  ).bind(owner, id)
}

async function deletePlainCategory(
  env: Env,
  owner: string,
  id: number,
): Promise<DeleteCategoryResult> {
  const usage = await countCategoryUsage(env, owner, id)
  if (usage > 0) throw new HttpError(409, `Category is in use by ${usage} record(s)`)
  // An unused category can still be the one investments are filed under; clear that in
  // the same batch so the delete cannot leave it dangling.
  const results = await env.DB.batch([
    clearInvestmentCategory(env, owner, id),
    env.DB.prepare('DELETE FROM categories WHERE id = ? AND owner = ?').bind(id, owner),
  ])
  const result = results[results.length - 1]
  if ((result?.meta.changes ?? 0) === 0) throw new HttpError(404, 'Category not found')
  return { reassignedToId: null }
}

async function resolveCategoryDeleteTarget(
  env: Env,
  owner: string,
  id: number,
  reassignToId: number | undefined,
  createInput: NewCategory | undefined,
): Promise<{ targetId: number; createdCategory?: Category }> {
  if (createInput) {
    const createdCategory = await createCategory(env, owner, createInput)
    return { targetId: createdCategory.id, createdCategory }
  }
  if (reassignToId === id) throw new HttpError(400, 'Cannot reassign a category to itself')
  await assertOwnedCategory(env, owner, reassignToId!)
  return { targetId: reassignToId! }
}

export async function deleteCategory(
  env: Env,
  owner: string,
  id: number,
  options?: DeleteCategoryOptions,
): Promise<DeleteCategoryResult> {
  const { reassignToId, createCategory: createInput } = options ?? {}
  if (reassignToId != null && createInput) {
    throw new HttpError(400, 'Specify either reassignToId or createCategory, not both')
  }

  if (reassignToId == null && !createInput) {
    return deletePlainCategory(env, owner, id)
  }

  const { targetId, createdCategory } = await resolveCategoryDeleteTarget(env, owner, id, reassignToId, createInput)

  try {
    // Move referencing rows and delete the source category as one D1 batch (implicit
    // transaction) so a mid-batch failure never leaves rows reassigned without the
    // source actually being deleted, or vice versa.
    const results = await env.DB.batch([
      env.DB.prepare('UPDATE transactions SET category_id = ? WHERE category_id = ? AND owner = ?').bind(
        targetId,
        id,
        owner,
      ),
      env.DB.prepare('UPDATE installment_plans SET category_id = ? WHERE category_id = ? AND owner = ?').bind(
        targetId,
        id,
        owner,
      ),
      clearInvestmentCategory(env, owner, id),
      env.DB.prepare('DELETE FROM categories WHERE id = ? AND owner = ?').bind(id, owner),
    ])
    const deleteResult = results[results.length - 1]
    if ((deleteResult?.meta.changes ?? 0) === 0) throw new HttpError(404, 'Category not found')

    return { reassignedToId: targetId, ...(createdCategory ? { createdCategory } : {}) }
  } catch (err) {
    // Inline-create can't join the batch above — the new category's id isn't known
    // until its own INSERT completes, and D1 batch() statements can't reference an
    // earlier statement's result. So a failure here (batch error, or the source
    // already gone) leaves a just-created, unused category behind; clean it up on a
    // best-effort basis rather than silently leaking it.
    if (createdCategory) await deleteOrphanedCategory(env, owner, createdCategory.id)
    throw err
  }
}

async function deleteOrphanedCategory(
  env: Env,
  owner: string,
  id: number,
): Promise<void> {
  try {
    await env.DB.prepare('DELETE FROM categories WHERE id = ? AND owner = ?').bind(id, owner).run()
  } catch {
    /* best-effort cleanup; the original error is what the caller should see */
  }
}
