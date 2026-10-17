import type { Env, ExpensesData } from '../../_shared/env'
import { backfillForRead } from '../../_shared/dbInstallmentBackfill'
import { singleParams } from '../../_shared/ledgerPartParams'
import { servePart } from '../../_shared/ledgerPartResponse'
import { mapAppError } from '../../_shared/mapAppError'

/**
 * The reference tables, the pinned rows and what the ledger holds (docs/SCALING.md, "Ledger parts"). It
 * runs the installment backfill when the browser's copy is not current, as `GET /api/expenses` does,
 * and fails the same way: a backfill that throws is logged and the read goes on.
 */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const { repo, owner } = context.data
  try {
    singleParams(new URL(context.request.url), [])
    return await servePart({
      db: context.env.DB,
      owner,
      request: context.request,
      part: 'reference',
      beforeRead: () => backfillForRead(context.env, owner),
      read: () => repo.readLedgerReference(owner),
    })
  } catch (error) {
    mapAppError(error)
  }
}
