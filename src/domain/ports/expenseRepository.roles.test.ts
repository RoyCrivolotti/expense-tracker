import { describe, expectTypeOf, it } from 'vitest'
import type { ExpenseAttachments, ExpenseLedgerReads, ExpenseLedgerWrites } from './expenseLedger'
import type { ExpensePlanning, ExpenseWealth } from './expensePlanning'
import type { ExpenseFlagsAndLabels, ExpenseReference } from './expenseReference'

type Roles = {
  ledgerReads: ExpenseLedgerReads
  ledgerWrites: ExpenseLedgerWrites
  attachments: ExpenseAttachments
  flagsAndLabels: ExpenseFlagsAndLabels
  reference: ExpenseReference
  planning: ExpensePlanning
  wealth: ExpenseWealth
}

/** The names two roles both declare, per pair. `never` for every pair means no method sits in two roles. */
type Shared = {
  [A in keyof Roles]: { [B in keyof Roles]: A extends B ? never : keyof Roles[A] & keyof Roles[B] }[keyof Roles]
}[keyof Roles]

describe('ExpenseRepository roles', () => {
  it('gives no method to two roles', () => {
    expectTypeOf<Shared>().toEqualTypeOf<never>()
  })
})
