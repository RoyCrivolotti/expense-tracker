/**
 * The writes that reach transactions from somewhere else: settling and unsettling, a flag deleted, an instalment
 * plan created, switched off and deleted, the backfill that a GET of the dataset runs, a category or account
 * deleted with its rows moved, the fill of `description_norm`, and an owner purged and restored from a backup.
 * The three raw statements stand for rows the routes cannot make any more (a payment recorded before its
 * covered count was kept) or only make in one shape.
 */
import { onRequestGet as getDataset } from '../../api/expenses/index'
import { onRequestDelete as deleteAccount } from '../../api/expenses/accounts/[id]'
import { onRequestDelete as deleteCategory } from '../../api/expenses/categories/[id]'
import { onRequestDelete as deleteFlag } from '../../api/expenses/flags/[id]'
import { onRequestPost as postPlan } from '../../api/expenses/installment-plans/index'
import { onRequestDelete as deletePlan, onRequestPatch as patchPlan } from '../../api/expenses/installment-plans/[id]'
import { onRequestPut as putLabels } from '../../api/expenses/transactions/[id]/labels'
import { onRequestPost as postBulkLabels } from '../../api/expenses/transactions/bulk/labels'
import { onRequestPatch as patchBulk } from '../../api/expenses/transactions/bulk'
import { loadDataset } from '../db'
import { fillDescriptionNorm } from '../descriptionNormBackfill'
import { purgeOwnerData } from '../ownerDataPurge'
import { restoreStatements, tablesOfDataset } from '../restoreSql'
import { call, chance, idsOf, int, newAccount, newCategory, newFlag, pick, rows } from './rollupKit'
import { someRows, type Step } from './rollupSteps'

const PAYMENT = "type IN ('refund', 'income') AND settled_by IS NULL"

export const settle: Step = async (k, owner) => {
  const [payment] = someRows(k, owner, 1, PAYMENT)
  const ids = someRows(k, owner, 1 + int(k, 3), `settled_by IS NULL AND id != ${payment ?? 0}`)
  if (payment === undefined || ids.length === 0) return 'settle: nothing to settle'
  const reply = await call(k, owner, patchBulk, '/transactions/bulk', { method: 'PATCH', body: { ids, patch: { settledBy: payment } } })
  return `settle ${ids.length} rows by ${payment} ${reply.status}`
}

export const unsettle: Step = async (k, owner) => {
  const ids = someRows(k, owner, 1 + int(k, 3), 'settled_by IS NOT NULL')
  if (ids.length === 0) return 'unsettle: nothing settled'
  const reply = await call(k, owner, patchBulk, '/transactions/bulk', { method: 'PATCH', body: { ids, patch: { settledBy: null } } })
  return `unsettle ${ids.length} ${reply.status}`
}

/** A payment recorded before the covered count was kept: rows point at it, and it has no count of its own. */
export const legacyPayment: Step = (k, owner) => {
  const [payment] = rows(k, 'SELECT DISTINCT settled_by AS id FROM transactions WHERE owner = ? AND settled_by IS NOT NULL', owner)
  if (!payment) return Promise.resolve('legacy payment: none')
  k.sqlite.prepare('UPDATE transactions SET report_count = NULL, report_covered_cents = NULL WHERE id = ?').run(Number(payment.id))
  return Promise.resolve(`legacy payment ${String(payment.id)}`)
}

/** A covered count of 0 or NULL on a random row, which is not pinned by it. */
export const zeroCount: Step = (k, owner) => {
  const [id] = someRows(k, owner, 1)
  if (id === undefined) return Promise.resolve('zero count: no rows')
  const value = chance(k, 0.5) ? 0 : null
  k.sqlite.prepare('UPDATE transactions SET report_count = ? WHERE id = ?').run(value, id)
  return Promise.resolve(`report_count of ${id} = ${String(value)}`)
}

export const relabel: Step = async (k, owner) => {
  const labels = idsOf(k, 'labels', owner)
  const [id] = someRows(k, owner, 1)
  if (id === undefined || labels.length === 0) return 'labels: nothing to do'
  const put = await call(k, owner, putLabels, `/transactions/${id}/labels`, { method: 'PUT', params: { id: String(id) }, body: { labelIds: [pick(k, labels)] } })
  const ids = someRows(k, owner, 3)
  const bulk = await call(k, owner, postBulkLabels, '/transactions/bulk/labels', { method: 'POST', body: { ids, labelIds: [pick(k, labels)] } })
  return `labels ${put.status} ${bulk.status}`
}

export const dropFlag: Step = async (k, owner) => {
  const flags = idsOf(k, 'flags', owner)
  if (flags.length === 0) return 'drop flag: none'
  const id = pick(k, flags)
  const reply = await call(k, owner, deleteFlag, `/flags/${id}`, { method: 'DELETE', params: { id: String(id) } })
  await newFlag(k, owner)
  return `drop flag ${id} ${reply.status}`
}

/** A plan on the card, due since June, then a GET of the dataset, which inserts a row for every month due. */
export const newPlan: Step = async (k, owner) => {
  const [card] = rows(k, "SELECT id FROM accounts WHERE owner = ? AND settlement = 'deferred' ORDER BY id", owner)
  if (!card) return 'plan: no card'
  const body = { description: 'Sofa', totalCount: 12, amountCents: 30_000, accountId: Number(card.id), categoryId: pick(k, idsOf(k, 'categories', owner)), type: 'expense', anchorBudgetMonth: '2026-06', startInstallmentIndex: 1, active: true }
  const reply = await call(k, owner, postPlan, '/installment-plans', { method: 'POST', body })
  const read = await call(k, owner, getDataset, '')
  return `plan ${reply.status}, dataset ${read.status} (${idsOf(k, 'transactions', owner, 'plan_id IS NOT NULL').length} plan rows)`
}

export const switchPlan: Step = async (k, owner) => {
  const plans = idsOf(k, 'installment_plans', owner)
  if (plans.length === 0) return 'plan switch: none'
  const id = pick(k, plans)
  const reply = await call(k, owner, patchPlan, `/installment-plans/${id}`, { method: 'PATCH', params: { id: String(id) }, body: { active: chance(k, 0.5) } })
  await call(k, owner, getDataset, '')
  return `plan ${id} switched ${reply.status}`
}

export const dropPlan: Step = async (k, owner) => {
  const plans = idsOf(k, 'installment_plans', owner)
  if (plans.length === 0) return 'plan delete: none'
  const id = pick(k, plans)
  const reply = await call(k, owner, deletePlan, `/installment-plans/${id}`, { method: 'DELETE', params: { id: String(id) } })
  return `plan ${id} deleted ${reply.status}`
}

/** A category or account deleted with its rows, plans and statements moved to another; one more is made so there is always another. */
export const reassign: Step = async (k, owner) => {
  const [table, handler, make, field] = chance(k, 0.5)
    ? (['categories', deleteCategory, newCategory, 'category'] as const)
    : (['accounts', deleteAccount, newAccount, 'account'] as const)
  const ids = idsOf(k, table, owner)
  const from = pick(k, ids)
  const to = pick(k, ids.filter((id) => id !== from))
  const reply = await call(k, owner, handler, `/${table}/${from}`, { method: 'DELETE', params: { id: String(from) }, body: { reassignToId: to } })
  await make(k, owner)
  return `${field} ${from} -> ${to} ${reply.status}`
}

/** The fill that gives old rows their normalized description: a statement that sets one column and no other. */
export const refillNorm: Step = async (k, owner) => {
  k.sqlite.prepare('UPDATE transactions SET description_norm = NULL WHERE owner = ?').run(owner)
  const filled = await fillDescriptionNorm(k.world.env.DB, owner)
  return `description_norm refilled ${filled.filled}`
}

/** Everything the owner has is deleted, as a revoke does, and put back from a backup of it by the restore script. */
export const purgeAndRestore: Step = async (k, owner) => {
  const tables = tablesOfDataset(await loadDataset(k.world.env, owner))
  await purgeOwnerData(k.world.env, owner)
  const gone = rows(k, 'SELECT COUNT(*) AS c FROM transactions WHERE owner = ?', owner)[0]!.c
  for (const statement of restoreStatements(owner, tables)) k.sqlite.exec(statement)
  return `purged (${String(gone)} left) and restored ${tables.transactions.length} rows`
}

export const readDataset: Step = async (k, owner) => `dataset ${(await call(k, owner, getDataset, '')).status}`
