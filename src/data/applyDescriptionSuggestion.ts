import type { ExpenseDataset } from '../types'
import { resolveDefaultAccountId } from './defaultAccount'
import type { DescriptionSuggestion, DescriptionTemplate } from './descriptionIndex'

/** Apply a suggestion template, falling back when category/account are inactive. */
export function resolveDescriptionTemplate(
  template: DescriptionTemplate,
  dataset: ExpenseDataset,
  current: { categoryId: number; accountId: number },
): DescriptionTemplate {
  const category = dataset.categories.find((c) => c.id === template.categoryId && c.active)
  const account = dataset.accounts.find((a) => a.id === template.accountId && a.active)
  return {
    type: template.type,
    categoryId: category?.id ?? current.categoryId,
    accountId: account?.id ?? resolveDefaultAccountId(dataset.accounts, dataset.settings),
  }
}

export function applyDescriptionSuggestion(
  suggestion: DescriptionSuggestion,
  dataset: ExpenseDataset,
  current: { categoryId: number; accountId: number },
): {
  description: string
  type: DescriptionTemplate['type']
  categoryId: number
  accountId: number
} {
  const resolved = resolveDescriptionTemplate(suggestion.template, dataset, current)
  return { description: suggestion.label, ...resolved }
}
