import type { Env, ExpensesData } from '../../_shared/env'
import { backfillForRead } from '../../_shared/dbInstallmentBackfill'
import { singleParams } from '../../_shared/ledgerPartParams'
import { servePart } from '../../_shared/ledgerPartResponse'
import { mapAppError } from '../../_shared/mapAppError'

/**
 * How many transactions, plans and statements name each category, account, flag and label of the owner
 * (docs/SCALING.md, "Usage counts"). Served and cached like the ledger parts: a request that holds the
 * current tag gets a 304 after two rows are read, before anything is counted. When it is not current it
 * runs the installment backfill first, as `GET /api/expenses` does, because a plan's payments are
 * transactions that name a category and an account, and the counts must be the ones the dataset gives.
 */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const { repo, owner } = context.data
  try {
    singleParams(new URL(context.request.url), [])
    return await servePart({
      db: context.env.DB,
      owner,
      request: context.request,
      part: 'usage',
      beforeRead: () => backfillForRead(context.env, owner),
      read: () => repo.readUsage(owner),
    })
  } catch (error) {
    mapAppError(error)
  }
}
