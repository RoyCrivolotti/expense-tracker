import { formatCents, type MoneyFormat } from '../../engine/money'
import type { TxnType } from '../../types'
import type { ReviewView } from './reviewFields'

const TYPE_WORD: Record<TxnType, string> = { expense: 'Expense', income: 'Income', investment: 'Investment', refund: 'Refund' }

export const typeWord = (type: TxnType | null): string => (type ? TYPE_WORD[type] : 'Type: pick one')

const fromIso = (iso: string) => new Date(`${iso}T12:00:00`)

/** "Tue 1 Dec", from a `YYYY-MM-DD` date. */
export function weekdayDay(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(fromIso(iso))
}

/** "Dec", from a `YYYY-MM` budget month. */
export function monthWord(yearMonth: string): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(fromIso(`${yearMonth}-01`))
}

/** The amount with its sign, as the row and the toast show it. An unknown amount is blank. */
export function signedAmount(view: ReviewView, format: MoneyFormat): string {
  if (view.amountCents === null) return ''
  const sign = view.type === 'income' || view.type === 'refund' ? '+' : view.type === 'expense' ? '−' : ''
  return `${sign}${formatCents(view.amountCents, format)}`
}

/** The seven fields as one line: type, category, account, date, budget month. Amount and description sit on the first. */
export function detailLine(view: ReviewView): string {
  return [
    typeWord(view.type),
    view.categoryName ?? 'No category',
    view.accountName ?? 'No account',
    weekdayDay(view.date),
    `${monthWord(view.budgetMonth)} budget`,
  ].join(' · ')
}

/** The undo toast: what was done on the first line, all seven fields on the second. */
export function toastText(verb: string, view: ReviewView, format: MoneyFormat): string {
  return `${verb} · ${view.description || 'Payment'} ${signedAmount(view, format)}\n${detailLine(view)}`.replace(/ \n/, '\n')
}

/** An amount in a currency other than euros, written with its own code. Never read as euros. */
export function foreignAmount(view: ReviewView): string {
  const major = (view.amountCents ?? 0) / 100
  const code = view.rec.currency ?? ''
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: code }).format(major)
  } catch {
    return `${major.toFixed(2)} ${code}`
  }
}
