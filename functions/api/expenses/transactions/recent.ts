import type { Env, ExpensesData } from '../../../_shared/env'
import { json } from '../../../_shared/http'
import { singleParams } from '../../../_shared/ledgerPartParams'
import { mapAppError } from '../../../_shared/mapAppError'
import { ValidationError } from '../../../domain/application/validationError'

const DEFAULT_LIMIT = 8
const MAX_LIMIT = 50

function limitOf(value: string | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT
  const limit = Number(value)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ValidationError(`limit must be a whole number from 1 to ${MAX_LIMIT}`)
  }
  return limit
}

/**
 * The rows added last: `?limit=` of them (1 to 50, default 8), highest id first, as `{ items }`. Ids only grow, so
 * this is the order rows were saved in whatever their date. Not cached: it follows every write.
 */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const { repo, owner } = context.data
  try {
    const { limit } = singleParams(new URL(context.request.url), ['limit'])
    const response = json({ items: await repo.recentTransactions(owner, limitOf(limit)) })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) {
    mapAppError(error)
  }
}
