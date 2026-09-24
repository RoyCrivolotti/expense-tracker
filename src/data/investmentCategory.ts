import type { Category, ExpenseSettings } from '../domain/types'

/**
 * The category every investment row is filed under, whichever way the money moves.
 * The setting wins when it names a live category; otherwise a category whose name says
 * investments is taken as meant for them; otherwise null, and the form's picker stays
 * free until one is chosen under Settings.
 */
export function resolveInvestmentCategoryId(
  categories: Category[],
  settings: ExpenseSettings,
): number | null {
  const chosen = settings.investmentCategoryId
  if (chosen != null && categories.some((c) => c.id === chosen && c.active)) return chosen
  const named = categories.find((c) => c.active && /invest/i.test(c.name))
  return named?.id ?? null
}
