import { parseIsoDate } from '../domain/engine/dates'
import type { Env } from './env'
import { toStatement, type StatementRow } from './rows'
import { HttpError } from './http'
import { assertOwnedAccount } from './ownership'

export async function setStatementPaid(
  env: Env,
  owner: string,
  accountId: number,
  yearMonth: string,
  paid: boolean,
  paidOn?: string,
) {
  await assertOwnedAccount(env, owner, accountId)
  let paidOnValue: string | null = null
  if (paid) {
    if (!paidOn) throw new HttpError(400, 'paidOn is required when paid is true')
    const parsed = parseIsoDate(paidOn)
    if (!parsed) throw new HttpError(400, 'paidOn must be YYYY-MM-DD')
    paidOnValue = parsed
  }
  const row = await env.DB.prepare(
    `INSERT INTO account_statements (owner, account_id, year_month, paid, paid_on)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(owner, account_id, year_month) DO UPDATE SET paid = excluded.paid, paid_on = excluded.paid_on
     RETURNING *`,
  )
    .bind(owner, accountId, yearMonth, paid ? 1 : 0, paidOnValue)
    .first<StatementRow>()
  if (!row) throw new HttpError(500, 'Statement upsert failed')
  return toStatement(row)
}
