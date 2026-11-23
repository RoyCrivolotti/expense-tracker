import type { ExpenseAttachments, ExpenseLedgerReads, ExpenseLedgerWrites } from './expenseLedger'
import type { ExpensePlanning, ExpenseWealth } from './expensePlanning'
import type { ExpenseFlagsAndLabels, ExpenseReference } from './expenseReference'

/** Persistence port — UI/API depend on this shape, not on D1 or any vendor SDK. */
export interface ExpenseRepository
  extends
    ExpenseLedgerReads,
    ExpenseLedgerWrites,
    ExpenseAttachments,
    ExpenseFlagsAndLabels,
    ExpenseReference,
    ExpensePlanning,
    ExpenseWealth {}
