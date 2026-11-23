/**
 * The write requests of a measurement run. They run after the reads, on rows they create themselves, and only
 * when asked.
 */
import { onRequestDelete as deleteOne } from '../../api/expenses/transactions/[id]'
import { onRequestPost as postOne } from '../../api/expenses/transactions/index'
import {
  onRequestDelete as deleteBulk,
  onRequestPatch as patchBulk,
  onRequestPost as postBulk,
} from '../../api/expenses/transactions/bulk'
import type { Case, State } from './routeCases'

const today = (): string => new Date().toISOString().slice(0, 10)

const fresh = (
  state: State,
  month: string,
  descriptions: string[],
) => ({
  date: today(),
  budgetMonth: month,
  accountId: state.rows[0]?.accountId,
  categoryId: state.rows[0]?.categoryId,
  type: 'expense',
  amountCents: 1234,
  description: descriptions[0] ?? 'Measurement row',
})

export const WRITE_CASES: Case[] = [
  {
    name: 'POST transactions, one row',
    writes: true,
    request: (
      s,
      m,
    ) => ({ handler: postOne, method: 'POST', path: '/transactions', body: fresh(s, m, ['Measurement single']) }),
    after: (
      b,
      _r,
      s,
    ) => {
      s.created.unshift(Number((b as { id?: number }).id))
    },
  },
  {
    name: 'POST transactions/bulk, 20 rows',
    writes: true,
    request: (
      s,
      m,
    ) => ({
      handler: postBulk,
      method: 'POST',
      path: '/transactions/bulk',
      body: { transactions: Array.from({ length: 20 }, (_, i) => fresh(s, m, [`Measurement bulk ${i}`])) },
    }),
    after: (
      b,
      _r,
      s,
    ) => {
      s.created.push(...((b as { transactions?: { id: number }[] }).transactions ?? []).map((t) => t.id))
    },
  },
  {
    name: 'PATCH transactions/bulk, 50 rows',
    writes: true,
    request: (s) => ({
      handler: patchBulk,
      method: 'PATCH',
      path: '/transactions/bulk',
      body: { ids: s.rows.slice(0, 50).map((r) => r.id), patch: { categoryId: s.otherCategoryId } },
    }),
  },
  {
    name: 'DELETE transactions/bulk, 20 rows',
    writes: true,
    request: (s) => ({
      handler: deleteBulk,
      method: 'DELETE',
      path: '/transactions/bulk',
      body: { ids: s.created.slice(1) },
    }),
  },
  {
    name: 'DELETE transactions/:id',
    writes: true,
    request: (s) => ({ handler: deleteOne, method: 'DELETE', path: '', params: { id: String(s.created[0] ?? 0) } }),
  },
]
