import type { Env, ExpensesData } from '../../../_shared/env'
import {
  bulkCreateTransactions,
  bulkDeleteTransactions,
  bulkUpdateTransactions,
} from '../../../domain/application/transactionService'
import {
  bulkUpdateTransactionsByFilter,
  isFilterBody,
  parseBulkFilterEdit,
} from '../../../domain/application/bulkEditService'
import { mapAppError } from '../../../_shared/mapAppError'
import { assertRevisionUnchanged } from '../../../_shared/revisionPrecondition'
import { receiptStore } from '../../../_shared/receiptStoreFactory'
import { removeReceiptsForTransactions } from '../../../_shared/receiptService'
import { json, readJson } from '../../../_shared/http'

interface BulkDeleteBody {
  ids: unknown
}

interface BulkCreateBody {
  transactions: unknown
}

export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<BulkCreateBody>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await bulkCreateTransactions(repo, owner, body.transactions), 201)
  } catch (error) {
    mapAppError(error)
  }
}

export const onRequestDelete: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<BulkDeleteBody>(context.request)
  const { repo, owner } = context.data
  try {
    // Same order as the single delete: bytes first, rows cascade with the batch.
    if (Array.isArray(body.ids)) {
      const ids = body.ids.filter((id): id is number => Number.isInteger(id))
      await removeReceiptsForTransactions(repo, receiptStore(context.env), owner, ids)
    }
    return json(await bulkDeleteTransactions(repo, owner, body.ids))
  } catch (error) {
    mapAppError(error)
  }
}

interface BulkUpdateBody {
  ids: unknown
  patch: unknown
}

/**
 * Two forms. `{ ids, patch }` edits the rows named (up to 500) and answers `{ updated, transactions }`.
 * `{ filter, expectedCount, expectedRevision, patch }` edits the rows a filter matches and answers
 * `{ updated }`; the rows are not sent back, because a filter can match up to `MAX_FILTER_EDIT_ROWS` of them and the
 * caller reads back the ones it shows.
 *
 * The filter is a `TxnFilter` as JSON, validated by the function the paged reads use. `expectedCount` and
 * `expectedRevision` are what the user was shown: `count` and `revision` of `GET /transactions/summary` for that
 * filter. The edit is refused with a 400 for an invalid body, filter or patch, an `expectedCount` over
 * `MAX_FILTER_EDIT_ROWS`, a filter that matches more rows than that, a patch that names another owner's account,
 * category, flag or payment, or a type change that would leave a withdrawal on an expense. It is refused with a
 * 409 if anything was written to the ledger since that revision (any write moves it, so an edit in another tab
 * counts), if the filter now matches another number of rows, if a row is settled by another payment, or if a row
 * changed in the moment between checking and writing. A refused request still moves the revision, as every write
 * request does, so look again before retrying. Edit only; a delete never takes a filter.
 */
export const onRequestPatch: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<BulkUpdateBody>(context.request)
  const { repo, owner } = context.data
  try {
    if (isFilterBody(body)) {
      const edit = parseBulkFilterEdit(body)
      assertRevisionUnchanged(context.data, edit.expectedRevision)
      return json(await bulkUpdateTransactionsByFilter(repo, owner, edit))
    }
    return json(await bulkUpdateTransactions(repo, owner, body.ids, body.patch))
  } catch (error) {
    mapAppError(error)
  }
}
