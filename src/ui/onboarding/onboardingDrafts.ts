import { useState } from 'react'
import { CATEGORY_PRESETS, type CategoryPreset } from '../../domain/onboarding/presets'
import { formatEuroInput, parseEuroToCents } from '../../engine/money'

export interface CategoryDraft {
  presetId: string
  selected: boolean
  budgetEuros: string
}

function presetId(name: string): string {
  return name
}

export function useCategoryDrafts() {
  return useState<CategoryDraft[]>(() =>
    CATEGORY_PRESETS.map((p) => ({
      presetId: presetId(p.name),
      selected: true,
      budgetEuros: formatEuroInput(p.defaultBudgetCents),
    })),
  )
}

export function buildSelectedPresets(drafts: CategoryDraft[]): CategoryPreset[] {
  return drafts.flatMap((draft, index) => {
    if (!draft.selected) return []
    const preset = CATEGORY_PRESETS[index]
    if (!preset) return []
    const monthlyBudgetCents = Math.max(0, parseEuroToCents(draft.budgetEuros))
    return [{ ...preset, defaultBudgetCents: monthlyBudgetCents }]
  })
}

export function useAccountsDraft() {
  const [debitName, setDebitName] = useState('Main debit')
  const [creditName, setCreditName] = useState('Credit card')
  const [addCredit, setAddCredit] = useState(false)
  return { debitName, creditName, addCredit, setDebitName, setCreditName, setAddCredit }
}
