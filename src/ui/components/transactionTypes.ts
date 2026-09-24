import type { TxnType } from '../../types'
import type { FormFields } from './transactionFormState'

/**
 * What the selector offers. Withdraw is not a stored type: it is an investment with a
 * negative amount, money coming back out of the portfolio, and the form keeps that as a
 * direction beside the type so the amount field stays a plain size.
 */
export type TypeChoice = TxnType | 'withdraw'

export const STORED_TYPES: readonly { value: TxnType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'investment', label: 'Invest' },
  { value: 'refund', label: 'Refund' },
]

/** The stored types plus Withdraw, for a form that edits one transaction's amount too. */
export const FORM_TYPES: readonly { value: TypeChoice; label: string }[] = [
  ...STORED_TYPES.slice(0, 3),
  { value: 'withdraw', label: 'Withdraw' },
  STORED_TYPES[3]!,
]

/** Money coming back out of the portfolio: an investment with the direction flipped. */
export function isWithdrawal(form: Pick<FormFields, 'type' | 'outflow'>): boolean {
  return form.type === 'investment' && form.outflow
}

export function typeChoice(form: Pick<FormFields, 'type' | 'outflow'>): TypeChoice {
  return form.type === 'investment' && form.outflow ? 'withdraw' : form.type
}
