import type { ExpenseModel } from '../useExpenseData'

export function findPaidOn(
  model: ExpenseModel,
  accountId: number,
  yearMonth: string,
): string | undefined {
  return model.dataset.accountStatements.find((s) => s.accountId === accountId && s.yearMonth === yearMonth)?.paidOn
}
