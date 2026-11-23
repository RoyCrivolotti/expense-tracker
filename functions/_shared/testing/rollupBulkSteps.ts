/**
 * The bulk writes to transactions through the real routes: create, delete and edit several rows in one request,
 * and edit every row a filter matches. The single-row steps are in rollupSteps.ts.
 */
import { onRequestGet as getSummary } from '../../api/expenses/transactions/summary'
import {
  onRequestDelete as deleteBulk,
  onRequestPatch as patchBulk,
  onRequestPost as postBulk,
} from '../../api/expenses/transactions/bulk'
import { OTHER, OWNER } from './expenseWorld'
import { MONTHS, call, chance, idsOf, int, pick, type Kit } from './rollupKit'
import { DESCRIPTIONS, newTransaction, someRows, type Step } from './rollupSteps'

export const createMany: Step = async (
  k,
  owner,
) => {
  const transactions = Array.from({ length: 2 + int(k, 4) }, () => newTransaction(k, owner))
  const reply = await call(k, owner, postBulk, '/transactions/bulk', { method: 'POST', body: { transactions } })
  return `bulk create ${transactions.length} ${reply.status}`
}

/** Ids of the owner's rows plus, now and then, one that is not theirs or not there. */
export const removeMany: Step = async (
  k,
  owner,
) => {
  const ids = someRows(k, owner, 1 + int(k, 4))
  if (chance(k, 0.3)) ids.push(...someRows(k, owner === OWNER ? OTHER : OWNER, 1), 999_999)
  const reply = await call(k, owner, deleteBulk, '/transactions/bulk', { method: 'DELETE', body: { ids } })
  return `bulk delete ${ids.length} ${reply.status}`
}

const BULK_PATCHES: Array<
  (
    k: Kit,
    owner: string,
  ) => Record<string, unknown>
> = [
  (
    k,
    o,
  ) => ({ categoryId: pick(k, idsOf(k, 'categories', o)) }),
  (
    k,
    o,
  ) => ({ accountId: pick(k, idsOf(k, 'accounts', o)) }),
  (k) => ({ type: pick(k, ['expense', 'income', 'refund']) }),
  (k) => ({ budgetMonth: pick(k, MONTHS) }),
  (k) => ({ date: `${pick(k, MONTHS)}-10` }),
  (
    k,
    o,
  ) => ({ flagId: chance(k, 0.3) ? null : pick(k, idsOf(k, 'flags', o)) }),
  (k) => ({ description: pick(k, DESCRIPTIONS) }),
]

export const editMany: Step = async (
  k,
  owner,
) => {
  const ids = someRows(k, owner, 1 + int(k, 8))
  const patch = pick(k, BULK_PATCHES)(k, owner)
  const reply = await call(k, owner, patchBulk, '/transactions/bulk', { method: 'PATCH', body: { ids, patch } })
  return `bulk edit ${ids.length} ${Object.keys(patch).join('+')} ${reply.status}`
}

/** An edit of every row in a month, as the filter form does it: the count and revision the summary showed. */
export const editByFilter: Step = async (
  k,
  owner,
) => {
  const month = pick(k, MONTHS)
  const seen = await call(k, owner, getSummary, `/transactions/summary?month=${month}`)
  if (seen.status !== 200) return `edit by filter: summary ${seen.status}`
  const body = {
    filter: { month },
    expectedCount: seen.body.count,
    expectedRevision: seen.body.revision,
    patch: pick(k, BULK_PATCHES)(k, owner),
  }
  const reply = await call(k, owner, patchBulk, '/transactions/bulk', { method: 'PATCH', body })
  return `edit by filter ${month} ${reply.status}`
}
