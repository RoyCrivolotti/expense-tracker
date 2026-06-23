import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewTransaction } from '../../../domain/data/dataSource'
import { HttpError, json, readJson } from '../../../_shared/http'
import { parseDeleteTransactionIds } from '../../../domain/data/transactionIds'

interface BulkDeleteBody {
  ids: unknown
}

interface BulkCreateBody {
  transactions: unknown
}

function validate(input: NewTransaction): NewTransaction {
  if (!input.date || !input.budgetMonth || !input.accountId || !input.categoryId) {
    throw new HttpError(400, 'date, budgetMonth, accountId and categoryId are required')
  }
  if (!Number.isFinite(input.amountCents)) throw new HttpError(400, 'amountCents must be a number')
  return input
}

export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<BulkCreateBody>(context.request)
  if (!Array.isArray(body.transactions)) {
    throw new HttpError(400, 'transactions array is required')
  }
  const { repo, owner } = context.data
  const created = []
  for (const raw of body.transactions) {
    created.push(await repo.insertTransaction(owner, validate(raw as NewTransaction)))
  }
  return json({ created: created.length, transactions: created }, 201)
}

export const onRequestDelete: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<BulkDeleteBody>(context.request)
  let ids: number[]
  try {
    ids = parseDeleteTransactionIds(body.ids)
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : 'Invalid ids')
  }
  const { repo, owner } = context.data
  const deleted = await repo.deleteTransactions(owner, ids)
  return json({ deleted, requested: ids.length })
}
