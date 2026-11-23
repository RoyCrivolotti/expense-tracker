import type { NewTransaction } from '../domain/data/dataSource'
import type { Env } from './env'
import { HttpError } from './http'
import { assertOwnedPlan } from './ownership'

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
export async function resolvePlanLink(
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
    excludeId != null ? [owner, input.planId, installmentIndex, excludeId] : [owner, input.planId, installmentIndex]
  const dup = await env.DB.prepare(
    `SELECT 1 AS ok FROM transactions WHERE owner = ? AND plan_id = ? AND installment_index = ?${guard}`,
  )
    .bind(...dupArgs)
    .first<{ ok: number }>()
  if (dup) throw new HttpError(400, 'Installment already recorded for this index')
  return { planId: input.planId, installmentIndex }
}

/**
 * Close out a plan once its final installment is recorded — the same end state
 * as the manual "Complete" toggle in the plans modal. Checked from the row D1
 * actually persisted rather than the write's input, so it catches a link, a
 * re-link, and an un-cancel alike (an update can flip `cancelled` back to false
 * with no `planId` in the patch at all).
 */
export async function maybeCompletePlan(
  env: Env,
  owner: string,
  planId: number | null,
): Promise<void> {
  if (planId == null) return
  const plan = await env.DB.prepare(
    'SELECT total_count AS t, active AS a FROM installment_plans WHERE id = ? AND owner = ?',
  )
    .bind(planId, owner)
    .first<{ t: number; a: number }>()
  if (!plan || !plan.a) return
  const last = await env.DB.prepare(
    'SELECT MAX(installment_index) AS m FROM transactions WHERE owner = ? AND plan_id = ? AND cancelled = 0',
  )
    .bind(owner, planId)
    .first<{ m: number | null }>()
  if (last?.m == null || last.m < plan.t) return
  await env.DB.prepare(
    "UPDATE installment_plans SET active = 0, updated_at = datetime('now') WHERE id = ? AND owner = ?",
  )
    .bind(planId, owner)
    .run()
}

/**
 * Column assignments for an update's plan link. Absent `planId` means no change;
 * an explicit `null` unlinks; a plan id links/moves (index resolved, self-excluded).
 */
export async function planLinkColumns(
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
