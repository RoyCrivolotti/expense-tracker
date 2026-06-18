import type { Env, ExpensesData } from '../../../_shared/env'
import { clearCashActual, setCashActual } from '../../../_shared/dbWrite'
import { HttpError, json, readJson } from '../../../_shared/http'

interface SetCashActualBody {
  yearMonth: string
  /** Integer cents, or null to clear (empty Actual field). */
  actualCashCents: number | null
}

export const onRequestPut: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<SetCashActualBody>(context.request)
  if (!/^\d{4}-\d{2}$/.test(body.yearMonth ?? '')) {
    throw new HttpError(400, 'yearMonth (YYYY-MM) is required')
  }
  if (body.actualCashCents === null) {
    await clearCashActual(context.env, context.data.owner, body.yearMonth)
    return json({ yearMonth: body.yearMonth, actualCashCents: null })
  }
  if (!Number.isInteger(body.actualCashCents)) {
    throw new HttpError(400, 'actualCashCents (integer) is required')
  }
  return json(
    await setCashActual(context.env, context.data.owner, body.yearMonth, body.actualCashCents),
  )
}
