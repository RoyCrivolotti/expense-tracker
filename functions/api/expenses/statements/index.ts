import type { Env, ExpensesData } from '../../../_shared/env'
import { setStatementPaid } from '../../../_shared/dbWrite'
import { HttpError, json, readJson } from '../../../_shared/http'

interface SetPaidBody {
  accountId: number
  yearMonth: string
  paid: boolean
}

export const onRequestPut: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<SetPaidBody>(context.request)
  if (!body.accountId || !/^\d{4}-\d{2}$/.test(body.yearMonth ?? '')) {
    throw new HttpError(400, 'accountId and yearMonth (YYYY-MM) are required')
  }
  return json(
    await setStatementPaid(
      context.env,
      context.data.owner,
      body.accountId,
      body.yearMonth,
      Boolean(body.paid),
    ),
  )
}
