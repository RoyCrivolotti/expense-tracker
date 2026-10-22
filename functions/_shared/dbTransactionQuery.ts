import type {
  TransactionKey,
  TransactionPage,
  TransactionPageRequest,
  TransactionSummary,
} from '../domain/data/transactionQuery'
import { SUMMARY_COUNT_CAP } from '../domain/data/transactionQuery'
import type { TxnFilter } from '../domain/engine/transactions'
import type { Transaction, TxnStatus } from '../domain/types'
import type { Env } from './env'
import { toStoredTxn, type TxnRow } from './rows'
import { countSql, netSpendSql, oneSql, pageSql, rowsByIdsSql, type Sql } from './transactionQuerySql'

export interface QueryRow extends TxnRow {
  status: TxnStatus
  /** JSON array of label ids. */
  label_ids: string
}

/** The shape `loadDataset` returns for a transaction, label ids in ascending order. */
export function toTransaction(row: QueryRow): Transaction {
  const labelIds = (JSON.parse(row.label_ids) as number[]).sort((a, b) => a - b)
  return { ...toStoredTxn(row), status: row.status, labelIds }
}

function run({ sql, params }: Sql, env: Env): D1PreparedStatement {
  return env.DB.prepare(sql).bind(...params)
}

export async function queryTransactions(
  env: Env,
  owner: string,
  filter: TxnFilter,
  page: TransactionPageRequest,
): Promise<TransactionPage> {
  const after: TransactionKey | undefined = page.after
  const { results } = await run(pageSql(owner, filter, page.limit, after), env).all<QueryRow>()
  const rows = results ?? []
  return { items: rows.slice(0, page.limit).map(toTransaction), hasMore: rows.length > page.limit }
}

export async function getTransaction(env: Env, owner: string, id: number): Promise<Transaction | null> {
  const row = await run(oneSql(owner, id), env).first<QueryRow>()
  return row ? toTransaction(row) : null
}

/** The owner's rows among `ids` in one read, with status and label ids derived as the list derives them. */
export async function getTransactionsByIds(env: Env, owner: string, ids: readonly number[]): Promise<Transaction[]> {
  const { results } = await run(rowsByIdsSql(owner, ids), env).all<QueryRow>()
  return (results ?? []).map(toTransaction)
}

/** Count and sum in one batch, so both describe the same moment. */
export async function summarizeTransactions(
  env: Env,
  owner: string,
  filter: TxnFilter,
): Promise<TransactionSummary> {
  const [count, net] = await env.DB.batch([
    run(countSql(owner, filter), env),
    run(netSpendSql(owner, filter), env),
  ])
  const n = (count?.results?.[0] as { n: number } | undefined)?.n ?? 0
  const netSpendCents = (net?.results?.[0] as { net: number } | undefined)?.net ?? 0
  return { count: Math.min(n, SUMMARY_COUNT_CAP), capped: n > SUMMARY_COUNT_CAP, netSpendCents }
}
