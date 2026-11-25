import type { InstallmentPlan, TxnType } from '../../types'
import type { NewInstallmentPlan } from '../../data/dataSource'
import { formatMoneyInput, parseMoneyToCents, type MoneyFormat } from '../../engine/money'

export const TXN_TYPES: TxnType[] = ['expense', 'income', 'investment', 'refund']

export interface Fields {
  description: string
  amount: string
  totalCount: string
  startInstallmentIndex: string
  anchorBudgetMonth: string
  dueDay: string
  accountId: number
  categoryId: number
  type: TxnType
  active: boolean
}

export function initialFields(
  plan: InstallmentPlan,
  format: MoneyFormat,
): Fields {
  return {
    description: plan.description,
    amount: formatMoneyInput(plan.amountCents, format),
    totalCount: String(plan.totalCount),
    startInstallmentIndex: String(plan.startInstallmentIndex),
    anchorBudgetMonth: plan.anchorBudgetMonth,
    dueDay: plan.dueDayOfMonth != null ? String(plan.dueDayOfMonth) : '',
    accountId: plan.accountId,
    categoryId: plan.categoryId,
    type: plan.type,
    active: plan.active,
  }
}

export function toPayload(
  f: Fields,
  format: MoneyFormat,
): NewInstallmentPlan {
  return {
    description: f.description.trim(),
    amountCents: Math.abs(parseMoneyToCents(f.amount, format)),
    totalCount: Number(f.totalCount),
    startInstallmentIndex: Number(f.startInstallmentIndex),
    anchorBudgetMonth: f.anchorBudgetMonth,
    dueDayOfMonth: f.dueDay.trim() === '' ? null : Number(f.dueDay),
    accountId: f.accountId,
    categoryId: f.categoryId,
    type: f.type,
    active: f.active,
  }
}
