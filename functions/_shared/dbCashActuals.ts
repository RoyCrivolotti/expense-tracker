import type { Env } from './env'
import { toCashActual, type CashActualRow } from './rows'
import { HttpError } from './http'

export async function setCashActual(
  env: Env,
  owner: string,
  yearMonth: string,
  actualCashCents: number,
) {
  const row = await env.DB.prepare(
    `INSERT INTO cash_actuals (owner, year_month, actual_cash_cents, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(owner, year_month) DO UPDATE SET
       actual_cash_cents = excluded.actual_cash_cents, updated_at = excluded.updated_at
     RETURNING *`,
  )
    .bind(owner, yearMonth, actualCashCents)
    .first<CashActualRow>()
  if (!row) throw new HttpError(500, 'Cash actual upsert failed')
  return toCashActual(row)
}

/** Remove a recorded actual-cash balance (empty input in the UI). */
export async function clearCashActual(
  env: Env,
  owner: string,
  yearMonth: string,
): Promise<void> {
  await env.DB.prepare('DELETE FROM cash_actuals WHERE year_month = ? AND owner = ?').bind(yearMonth, owner).run()
}
