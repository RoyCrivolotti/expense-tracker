import type { ExpenseDataset } from '../../types'
import type { ExpenseDataSource } from '../../data/dataSource'
import type { CategoryPreset } from '../../domain/onboarding/presets'
import {
  patchAfterAccount,
  patchAfterCategory,
  patchAfterSettings,
} from '../datasetPatches'

export interface OnboardingSetupInput {
  categories: CategoryPreset[]
  debitName: string
  creditName: string | null
  money: {
    currencyCode: string
    numberLocale: string
    budgetRolloverDay: number
  }
}

export async function runOnboardingSetup(
  source: ExpenseDataSource,
  applyPatch: (patch: (dataset: ExpenseDataset) => ExpenseDataset) => void,
  input: OnboardingSetupInput,
): Promise<void> {
  let sortOrder = 0
  for (const preset of input.categories) {
    const category = await source.createCategory!({
      name: preset.name,
      icon: preset.icon,
      monthlyBudgetCents: preset.defaultBudgetCents,
      sortOrder: sortOrder++,
      active: true,
    })
    applyPatch((d) => patchAfterCategory(d, category))
  }

  const debit = await source.createAccount!({
    name: input.debitName.trim(),
    kind: 'debit',
    settlement: 'immediate',
    active: true,
  })
  applyPatch((d) => patchAfterAccount(d, debit))

  if (input.creditName?.trim()) {
    const credit = await source.createAccount!({
      name: input.creditName.trim(),
      kind: 'credit',
      settlement: 'deferred',
      active: true,
    })
    applyPatch((d) => patchAfterAccount(d, credit))
  }

  const settings = await source.updateSettings!({
    defaultAccountId: debit.id,
    currencyCode: input.money.currencyCode,
    numberLocale: input.money.numberLocale,
    budgetRolloverDay: input.money.budgetRolloverDay,
  })
  applyPatch((d) => patchAfterSettings(d, settings))
}
