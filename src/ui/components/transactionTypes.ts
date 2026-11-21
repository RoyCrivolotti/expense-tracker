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

const TYPE_HINTS = {
  withdraw:
    'Money taken out of your investments and into this account: a sale moved to cash, a dividend paid out. Moving money between investment accounts is not a withdrawal.',
  investment:
    'Money you put into your investments: shares, funds, a deposit to a broker. It counts as invested, not as spending.',
  refund: 'Money paid back for something you bought: a returned item, a reimbursement. It comes off the spending of the category you pick.',
} as const

/** The word under the type chips for the types that need one; Expense and Income say it themselves. */
export function typeHint(form: Pick<FormFields, 'type' | 'outflow'>): string | null {
  const choice = typeChoice(form)
  return choice === 'withdraw' || choice === 'investment' || choice === 'refund' ? TYPE_HINTS[choice] : null
}
