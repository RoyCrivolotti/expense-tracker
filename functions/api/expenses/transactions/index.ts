import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewTransaction } from '../../../../src/data/dataSource'
import { insertTransaction } from '../../../_shared/dbWrite'
import { HttpError, json, readJson } from '../../../_shared/http'

function validate(input: NewTransaction): NewTransaction {
  if (!input.date || !input.budgetMonth || !input.accountId || !input.categoryId) {
    throw new HttpError(400, 'date, budgetMonth, accountId and categoryId are required')
  }
  if (!Number.isFinite(input.amountCents)) throw new HttpError(400, 'amountCents must be a number')
  return input
}

export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const input = validate(await readJson<NewTransaction>(context.request))
  return json(await insertTransaction(context.env, context.data.owner, input), 201)
}
