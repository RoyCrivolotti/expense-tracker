import type { Env, ExpensesData } from '../../../_shared/env'
import { parseIsoDate } from '../../../domain/engine/dates'
import { HttpError, json, readJson } from '../../../_shared/http'

interface SetPaidBody {
  accountId: number
  yearMonth: string
  paid: boolean
  paidOn?: string
}

export const onRequestPut: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<SetPaidBody>(context.request)
  if (!body.accountId || !/^\d{4}-\d{2}$/.test(body.yearMonth ?? '')) {
    throw new HttpError(400, 'accountId and yearMonth (YYYY-MM) are required')
  }
  if (Boolean(body.paid) && !body.paidOn) {
    throw new HttpError(400, 'paidOn is required when paid is true')
  }
  if (body.paidOn && !parseIsoDate(body.paidOn)) {
    throw new HttpError(400, 'paidOn must be YYYY-MM-DD')
  }
  const { repo, owner } = context.data
  return json(
    await repo.setStatementPaid(
      owner,
      body.accountId,
      body.yearMonth,
      Boolean(body.paid),
      body.paidOn,
    ),
  )
}
