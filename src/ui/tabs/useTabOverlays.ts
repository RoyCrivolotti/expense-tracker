import { useState } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import type { FlagGroup } from '../../domain/engine/flagGroups'
import type { StatementPaymentRow } from '../../engine'
import { usePastReports } from './usePastReports'
import { useReimbursement } from './useReimbursement'

/** What the Transactions tab has open besides its list: the statement, flag, report and reimbursement sheets. */
export function useTabOverlays(
  model: ExpenseModel,
  actions: ExpenseActions | undefined,
) {
  const [editingStatement, setEditingStatement] = useState<StatementPaymentRow | null>(null)
  const [statementPending, setStatementPending] = useState(false)
  const [managingFlags, setManagingFlags] = useState(false)
  const [clearingGroup, setClearingGroup] = useState<FlagGroup | null>(null)
  const reimbursement = useReimbursement(actions)
  const [reportFlagId, setReportFlagId] = useState<number | null>(null)
  const past = usePastReports(model.dataset.transactions)
  return {
    editingStatement,
    setEditingStatement,
    statementPending,
    setStatementPending,
    managingFlags,
    setManagingFlags,
    clearingGroup,
    setClearingGroup,
    reimbursement,
    reportFlagId,
    setReportFlagId,
    past,
  }
}

export type TabOverlays = ReturnType<typeof useTabOverlays>
