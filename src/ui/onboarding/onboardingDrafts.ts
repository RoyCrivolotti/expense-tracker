import { useState } from 'react'
import { CATEGORY_PRESETS, type CategoryPreset } from '../../domain/onboarding/presets'
import { EU_MONEY_FORMAT, formatMoneyInput, parseMoneyToCents, type MoneyFormat } from '../../engine/money'

export interface CategoryDraft {
  presetId: string
  selected: boolean
  budgetEuros: string
}

function presetId(name: string): string {
  return name
}

/**
 * On a genuine first run every preset starts checked, since the tenant has
 * nothing yet and picking at least one is required. On re-entry, defaulting
 * to all-checked would mean "Continue" re-adds every preset category (this
 * wizard has no dedup) unless the user manually unchecks each one — so
 * re-entry starts every preset unchecked instead, and the wizard's own
 * "Continue" gate must allow zero selections in that case.
 */
export function useCategoryDrafts(format: MoneyFormat = EU_MONEY_FORMAT, hasExistingCategories = false) {
  return useState<CategoryDraft[]>(() =>
    CATEGORY_PRESETS.map((p) => ({
      presetId: presetId(p.name),
      selected: !hasExistingCategories,
      budgetEuros: formatMoneyInput(p.defaultBudgetCents, format),
    })),
  )
}

export function buildSelectedPresets(
  drafts: CategoryDraft[],
  format: MoneyFormat = EU_MONEY_FORMAT,
): CategoryPreset[] {
  return drafts.flatMap((draft, index) => {
    if (!draft.selected) return []
    const preset = CATEGORY_PRESETS[index]
    if (!preset) return []
    const monthlyBudgetCents = Math.max(0, parseMoneyToCents(draft.budgetEuros, format))
    return [{ ...preset, defaultBudgetCents: monthlyBudgetCents }]
  })
}

/**
 * `addDebit` defaults to true when the tenant has no accounts yet (first run
 * must end up with at least one account) and false otherwise (re-entry,
 * opt-in) — symmetric with `addCredit`.
 */
export function useAccountsDraft(hasExistingAccounts: boolean) {
  const [debitName, setDebitName] = useState('Main debit')
  const [creditName, setCreditName] = useState('Credit card')
  const [addCredit, setAddCredit] = useState(false)
  const [addDebit, setAddDebit] = useState(!hasExistingAccounts)
  return { debitName, creditName, addCredit, addDebit, setDebitName, setCreditName, setAddCredit, setAddDebit }
}
