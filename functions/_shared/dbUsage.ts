import type { Usage } from '../domain/data/usage'
import type { Env } from './env'
import { USAGE_SQL, type UsageRow } from './usageSql'

const byId = (a: { id: number }, b: { id: number }): number => a.id - b.id

/** The rows of one kind, by their `a`. */
function byA(rows: UsageRow[], kind: UsageRow['kind']): Map<number, UsageRow> {
  return new Map(rows.filter((r) => r.kind === kind).map((r) => [r.a, r]))
}

/** Sums `n` of the `cell` rows by their category (`a`) or account (`b`). */
function cellTotals(rows: UsageRow[], key: 'a' | 'b'): Map<number, number> {
  const sums = new Map<number, number>()
  for (const row of rows) {
    const id = row[key]
    if (row.kind === 'cell' && id !== null) sums.set(id, (sums.get(id) ?? 0) + row.n)
  }
  return sums
}

/** Every category, account, flag and label of the owner with the number of records that name it. */
export async function readUsage(env: Env, owner: string): Promise<Usage> {
  const { results } = await env.DB.prepare(USAGE_SQL).bind(owner).all<UsageRow>()
  const rows = results ?? []
  const txByCategory = cellTotals(rows, 'a')
  const txByAccount = cellTotals(rows, 'b')
  return {
    categories: [...byA(rows, 'category').values()]
      .map((r) => ({ id: r.a, transactions: txByCategory.get(r.a) ?? 0, plans: r.n }))
      .sort(byId),
    accounts: [...byA(rows, 'account').values()]
      .map((r) => ({ id: r.a, transactions: txByAccount.get(r.a) ?? 0, plans: r.b ?? 0, statements: r.n }))
      .sort(byId),
    flags: [...byA(rows, 'flag').values()].map((r) => ({ id: r.a, transactions: r.n })).sort(byId),
    labels: [...byA(rows, 'label').values()].map((r) => ({ id: r.a, transactions: r.n })).sort(byId),
  }
}
