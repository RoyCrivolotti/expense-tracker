import type { Env, ExpensesData } from '../../_shared/env'
import { cubeRange, readMonthCube } from '../../domain/application/ledgerPartsService'
import { monthRangeParams } from '../../_shared/ledgerPartParams'
import { servePart } from '../../_shared/ledgerPartResponse'
import { mapAppError } from '../../_shared/mapAppError'

/**
 * The per-month sums of the unpinned rows in a range of budget months: `?from=YYYY-MM&to=YYYY-MM`, both
 * inclusive. A cell is what `buildCells` makes of the rows (see docs/API.md).
 */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const { repo, owner } = context.data
  try {
    const range = cubeRange(monthRangeParams(new URL(context.request.url)))
    return await servePart({
      db: context.env.DB,
      owner,
      request: context.request,
      part: 'cube',
      scope: `${range.from}..${range.to}`,
      read: () => readMonthCube(repo, owner, range),
    })
  } catch (error) {
    mapAppError(error)
  }
}
