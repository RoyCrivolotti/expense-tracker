import type { Env, ExpensesData } from '../../../_shared/env'
import { readMonthRows, rowsRange } from '../../../domain/application/ledgerPartsService'
import { monthRangeParams } from '../../../_shared/ledgerPartParams'
import { servePart } from '../../../_shared/ledgerPartResponse'
import { mapAppError } from '../../../_shared/mapAppError'

/** Every row of a range of budget months, newest first: `?from=YYYY-MM&to=YYYY-MM`, both inclusive. */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const { repo, owner } = context.data
  try {
    // Checked before anything is read, so a bad range costs no query.
    const range = rowsRange(monthRangeParams(new URL(context.request.url)))
    return await servePart({
      db: context.env.DB,
      owner,
      request: context.request,
      part: 'months',
      scope: `${range.from}..${range.to}`,
      read: () => readMonthRows(repo, owner, range),
    })
  } catch (error) {
    mapAppError(error)
  }
}
