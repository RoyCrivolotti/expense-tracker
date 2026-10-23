/**
 * Writes to transactions through the real routes: create, the edit form, single-field edits, bulk create, edit,
 * delete, and edit by filter. Each step picks its own targets from the database, takes one request, and says in
 * a line what it did. A request the route refuses (a 400 or 409) is a step that changed nothing, which is also
 * something the rollup has to survive.
 */
import { onRequestGet as getSummary } from '../../api/expenses/transactions/summary'
import { onRequestPost as postTransaction } from '../../api/expenses/transactions/index'
import { onRequestDelete as deleteOne, onRequestPatch as patchOne } from '../../api/expenses/transactions/[id]'
import { onRequestDelete as deleteBulk, onRequestPatch as patchBulk, onRequestPost as postBulk } from '../../api/expenses/transactions/bulk'
import { OTHER, OWNER } from './expenseWorld'
import { MONTHS, call, chance, idsOf, int, pick, rows, type Kit } from './rollupKit'

export type Step = (k: Kit, owner: string) => Promise<string>

const DESCRIPTIONS = ['Market', 'Train', 'Salary', 'Rent', 'Coffee', 'Refund', 'ETF']
const TYPES = ['expense', 'expense', 'expense', 'income', 'refund', 'investment'] as const

/** A new transaction's body: random type, month, account, category, sign (negative only on an investment) and flag. */
export function newTransaction(k: Kit, owner: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  const type = pick(k, TYPES)
  const month = pick(k, MONTHS)
  const cents = (1 + int(k, 900)) * 100
  const flags = idsOf(k, 'flags', owner)
  return {
    date: `${month}-${String(1 + int(k, 27)).padStart(2, '0')}`,
    budgetMonth: month,
    description: pick(k, DESCRIPTIONS),
    accountId: pick(k, idsOf(k, 'accounts', owner)),
    categoryId: pick(k, idsOf(k, 'categories', owner)),
    type,
    amountCents: type === 'investment' && chance(k, 0.4) ? -cents : cents,
    cancelled: chance(k, 0.1),
    ...(chance(k, 0.15) && flags.length > 0 ? { flagId: pick(k, flags) } : {}),
    ...over,
  }
}

export const create: Step = async (k, owner) => {
  const reply = await call(k, owner, postTransaction, '/transactions', { method: 'POST', body: newTransaction(k, owner) })
  return `create ${reply.status}`
}

export const createMany: Step = async (k, owner) => {
  const transactions = Array.from({ length: 2 + int(k, 4) }, () => newTransaction(k, owner))
  const reply = await call(k, owner, postBulk, '/transactions/bulk', { method: 'POST', body: { transactions } })
  return `bulk create ${transactions.length} ${reply.status}`
}

/** The ids of up to `n` of the owner's rows, in a random order. */
export function someRows(k: Kit, owner: string, n: number, where = '1 = 1'): number[] {
  const ids = idsOf(k, 'transactions', owner, where)
  return ids.sort(() => k.rng() - 0.5).slice(0, n)
}

/** What the edit form sends: every field of the row, changed or not. */
export function formOf(k: Kit, id: number): Record<string, unknown> {
  const r = rows(k, 'SELECT * FROM transactions WHERE id = ?', id)[0]!
  return {
    date: r.date, budgetMonth: r.budget_month, description: r.description, accountId: r.account_id,
    categoryId: r.category_id, type: r.type, amountCents: r.amount_cents, cancelled: r.cancelled === 1, notes: r.notes ?? null,
  }
}

export async function edit(k: Kit, owner: string, id: number, body: Record<string, unknown>): Promise<number> {
  const reply = await call(k, owner, patchOne, `/transactions/${id}`, { method: 'PATCH', params: { id: String(id) }, body })
  return reply.status
}

export const editFormUnchanged: Step = async (k, owner) => {
  const [id] = someRows(k, owner, 1)
  return id === undefined ? 'edit form: no rows' : `edit form unchanged ${id} ${await edit(k, owner, id, formOf(k, id))}`
}

/** One to three fields of the form changed to another value, the rest sent as they were. */
export const editFormChanged: Step = async (k, owner) => {
  const [id] = someRows(k, owner, 1)
  if (id === undefined) return 'edit: no rows'
  const form = formOf(k, id)
  const month = pick(k, MONTHS)
  const changes: Array<[string, () => Record<string, unknown>]> = [
    ['category', () => ({ categoryId: pick(k, idsOf(k, 'categories', owner)) })],
    ['account', () => ({ accountId: pick(k, idsOf(k, 'accounts', owner)) })],
    ['amount', () => ({ amountCents: Number(form.amountCents) + Math.sign(Number(form.amountCents)) * (1 + int(k, 9)) * 100 })],
    ['sign', () => ({ amountCents: -Math.abs(Number(form.amountCents)), type: 'investment' })],
    ['month', () => ({ budgetMonth: month, date: `${month}-15` })],
    ['cancelled', () => ({ cancelled: form.cancelled !== true })],
    ['type', () => ({ type: pick(k, ['expense', 'income', 'refund', 'investment']), amountCents: Math.abs(Number(form.amountCents)) })],
    ['notes', () => ({ notes: `note ${int(k, 50)}` })],
  ]
  const chosen = changes.sort(() => k.rng() - 0.5).slice(0, 1 + int(k, 3))
  const body = chosen.reduce<Record<string, unknown>>((sofar, [, change]) => ({ ...sofar, ...change() }), { ...form })
  return `edit ${id} ${chosen.map(([name]) => name).join('+')} ${await edit(k, owner, id, body)}`
}

/** A PATCH that names one column, so the UPDATE's SET list holds that column and no other (the edit form names them all). */
export const editPartial: Step = async (k, owner) => {
  const [id] = someRows(k, owner, 1)
  if (id === undefined) return 'partial edit: no rows'
  const form = formOf(k, id)
  const cents = Number(form.amountCents)
  const options: Array<[string, Record<string, unknown>]> = [
    ['cancelled', { cancelled: form.cancelled !== true }],
    ['amount', { amountCents: cents + Math.sign(cents) * 100 }],
    ['sign', { amountCents: -cents }],
    ['month', { budgetMonth: pick(k, MONTHS) }],
    ['type', { type: pick(k, ['expense', 'income', 'refund', 'investment']) }],
  ]
  const [name, body] = pick(k, options)
  return `partial edit ${id} ${name} ${await edit(k, owner, id, body)}`
}

export const setFlag: Step = async (k, owner) => {
  const [id] = someRows(k, owner, 1)
  const flags = idsOf(k, 'flags', owner)
  if (id === undefined || flags.length === 0) return 'flag: nothing to do'
  const flagId = chance(k, 0.4) ? null : pick(k, flags)
  return `flag ${id} -> ${flagId} ${await edit(k, owner, id, { flagId })}`
}

export const remove: Step = async (k, owner) => {
  const [id] = someRows(k, owner, 1)
  if (id === undefined) return 'delete: no rows'
  const reply = await call(k, owner, deleteOne, `/transactions/${id}`, { method: 'DELETE', params: { id: String(id) } })
  return `delete ${id} ${reply.status}`
}

/** Ids of the owner's rows plus, now and then, one that is not theirs or not there. */
export const removeMany: Step = async (k, owner) => {
  const ids = someRows(k, owner, 1 + int(k, 4))
  if (chance(k, 0.3)) ids.push(...someRows(k, owner === OWNER ? OTHER : OWNER, 1), 999_999)
  const reply = await call(k, owner, deleteBulk, '/transactions/bulk', { method: 'DELETE', body: { ids } })
  return `bulk delete ${ids.length} ${reply.status}`
}

const BULK_PATCHES: Array<(k: Kit, owner: string) => Record<string, unknown>> = [
  (k, o) => ({ categoryId: pick(k, idsOf(k, 'categories', o)) }),
  (k, o) => ({ accountId: pick(k, idsOf(k, 'accounts', o)) }),
  (k) => ({ type: pick(k, ['expense', 'income', 'refund']) }),
  (k) => ({ budgetMonth: pick(k, MONTHS) }),
  (k) => ({ date: `${pick(k, MONTHS)}-10` }),
  (k, o) => ({ flagId: chance(k, 0.3) ? null : pick(k, idsOf(k, 'flags', o)) }),
  (k) => ({ description: pick(k, DESCRIPTIONS) }),
]

export const editMany: Step = async (k, owner) => {
  const ids = someRows(k, owner, 1 + int(k, 8))
  const patch = pick(k, BULK_PATCHES)(k, owner)
  const reply = await call(k, owner, patchBulk, '/transactions/bulk', { method: 'PATCH', body: { ids, patch } })
  return `bulk edit ${ids.length} ${Object.keys(patch).join('+')} ${reply.status}`
}

/** An edit of every row in a month, as the filter form does it: the count and revision the summary showed. */
export const editByFilter: Step = async (k, owner) => {
  const month = pick(k, MONTHS)
  const seen = await call(k, owner, getSummary, `/transactions/summary?month=${month}`)
  if (seen.status !== 200) return `edit by filter: summary ${seen.status}`
  const body = { filter: { month }, expectedCount: seen.body.count, expectedRevision: seen.body.revision, patch: pick(k, BULK_PATCHES)(k, owner) }
  const reply = await call(k, owner, patchBulk, '/transactions/bulk', { method: 'PATCH', body })
  return `edit by filter ${month} ${reply.status}`
}
