import type { BulkTransactionPatch, ExpenseDataSource, NewTransaction } from '../data/dataSource'
import type { ExpenseActions } from './actions'
import { type ApplyPatch, type bulkWriteOf, unchanged } from './bulkWrite'
import {
  patchAfterAttachmentAdd,
  patchAfterAttachmentDelete,
  patchAfterBulkDelete,
  patchAfterBulkUpdate,
  patchAfterCashActual,
  patchAfterStatementPaid,
  patchAfterTransactionDelete,
  patchAfterTransactionUpdate,
} from './datasetPatches'

type BulkWrite = ReturnType<typeof bulkWriteOf>

type TransactionWrites =
  | 'updateTransaction'
  | 'deleteTransaction'
  | 'deleteTransactions'
  | 'updateTransactions'
  | 'addLabels'
  | 'updateMatching'

/** The writes that change or remove transactions already saved. */
export function transactionWrites(
  source: ExpenseDataSource,
  applyPatch: ApplyPatch,
  bulkWrite: BulkWrite,
): Pick<ExpenseActions, TransactionWrites> {
  return {
    updateTransaction: async (
      id: number,
      patch: Partial<NewTransaction>,
    ) => {
      const txn = await source.updateTransaction!(id, patch)
      applyPatch((d) => patchAfterTransactionUpdate(d, txn), { ids: [id], patch })
    },
    deleteTransaction: async (id) => {
      await source.deleteTransaction!(id)
      applyPatch((d) => patchAfterTransactionDelete(d, id), { ids: [id] })
    },
    deleteTransactions: (ids) =>
      bulkWrite(
        () => source.deleteTransactions!(ids),
        // Still drop every requested id locally: one the server did not delete is one
        // that was already gone, so the local copy is the stale side either way.
        () => applyPatch((d) => patchAfterBulkDelete(d, ids), { ids }),
        ({ deleted }) => deleted,
      ),
    updateTransactions: (
      ids: number[],
      patch: BulkTransactionPatch,
    ) =>
      bulkWrite(
        () => source.updateTransactions!(ids, patch),
        (result) => applyPatch((d) => patchAfterBulkUpdate(d, result.transactions), { ids, patch }),
        ({ updated }) => updated,
      ),
    // The server answers with counts and not the rows, so a ledger that shows them reads them again.
    addLabels: (
      ids,
      labelIds,
    ) =>
      bulkWrite(
        () => source.addLabelsToTransactions!(ids, labelIds),
        () => applyPatch(unchanged, { patch: {} }),
        ({ matched }) => matched,
      ),
    updateMatching: (
      target,
      patch,
      labelIds,
    ) =>
      bulkWrite(
        () => source.updateMatchingTransactions!(target, patch, labelIds),
        () => applyPatch(unchanged, { patch }),
        ({ updated }) => updated,
      ),
  }
}

type StatementWrites = 'setStatementPaid' | 'setCashActual' | 'uploadAttachment' | 'deleteAttachment'

/** The writes of a card statement's payment, a month's cash, and receipts. */
export function statementWrites(
  source: ExpenseDataSource,
  applyPatch: ApplyPatch,
): Pick<ExpenseActions, StatementWrites> {
  return {
    setStatementPaid: async (
      accountId,
      yearMonth,
      paid,
      paidOn,
    ) => {
      const stmt = await source.setStatementPaid!(accountId, yearMonth, paid, paidOn)
      applyPatch((d) => patchAfterStatementPaid(d, stmt))
    },
    setCashActual: async (
      yearMonth,
      actualCashCents,
    ) => {
      const row = await source.setCashActual!(yearMonth, actualCashCents)
      applyPatch((d) => patchAfterCashActual(d, row, yearMonth))
    },
    uploadAttachment: async (
      transactionId,
      file,
    ) => {
      const attachment = await source.uploadAttachment!(transactionId, file)
      applyPatch((d) => patchAfterAttachmentAdd(d, attachment))
    },
    deleteAttachment: async (id) => {
      await source.deleteAttachment!(id)
      applyPatch((d) => patchAfterAttachmentDelete(d, id))
    },
  }
}
