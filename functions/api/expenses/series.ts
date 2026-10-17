import type { Env, ExpensesData } from '../../_shared/env'
import { singleParams } from '../../_shared/ledgerPartParams'
import { servePart } from '../../_shared/ledgerPartResponse'
import { mapAppError } from '../../_shared/mapAppError'

/**
 * The owner's recurring series over the whole history, newest first, in the shape the detectors take
 * (`RecurringSeries`; docs/SCALING.md, "Recurring series"). It is served and cached like the ledger
 * parts: a request that holds the current tag gets a 304 after two rows are read, before any series
 * is computed. There is nothing for the installment backfill to add, since a plan's payments are not
 * part of a series.
 */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const { repo, owner } = context.data
  try {
    singleParams(new URL(context.request.url), [])
    return await servePart({
      db: context.env.DB,
      owner,
      request: context.request,
      part: 'series',
      read: async () => ({ series: await repo.readSeries(owner) }),
    })
  } catch (error) {
    mapAppError(error)
  }
}
