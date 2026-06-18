import { useMemo } from 'react'
import type { ExpenseDataSource } from '../data/dataSource'
import type { ExpenseActions, ExpenseModalState } from './actions'

type OpenModal = (state: Exclude<ExpenseModalState, null>) => void

/** Build the write-actions object, or `undefined` for read-only sources. */
export function useExpenseActions(
  source: ExpenseDataSource,
  reload: () => void,
  openModal: OpenModal,
): ExpenseActions | undefined {
  return useMemo(() => {
    if (!source.canWrite) return undefined
    const after = async (work: Promise<unknown>) => {
      await work
      reload()
    }
    return {
      onAdd: () => openModal({ mode: 'add' }),
      onEdit: (txn) => openModal({ mode: 'edit', txn }),
      deleteTransaction: (id) => after(source.deleteTransaction!(id)),
      deleteTransactions: (ids) => after(source.deleteTransactions!(ids)),
      setStatementPaid: (accountId, yearMonth, paid) =>
        after(source.setStatementPaid!(accountId, yearMonth, paid)),
      setCashActual: (yearMonth, actualCashCents) =>
        after(source.setCashActual!(yearMonth, actualCashCents)),
      createCategory: (input) => after(source.createCategory!(input)),
      updateCategory: (id, patch) => after(source.updateCategory!(id, patch)),
      createAccount: (input) => after(source.createAccount!(input)),
      updateAccount: (id, patch) => after(source.updateAccount!(id, patch)),
      updateSettings: (patch) => after(source.updateSettings!(patch)),
      updateGoals: (patch) => after(source.updateGoals!(patch)),
    }
  }, [source, reload, openModal])
}
