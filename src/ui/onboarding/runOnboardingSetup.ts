import type { ExpenseDataset, ExpenseSettings } from '../../types'
import type { ExpenseDataSource } from '../../data/dataSource'
import type { CategoryPreset } from '../../domain/onboarding/presets'
import {
  patchAfterAccount,
  patchAfterCategory,
  patchAfterSettings,
} from '../datasetPatches'

export interface OnboardingSetupInput {
  categories: CategoryPreset[]
  /** Whether to create a new debit account this run (false on re-entry unless opted in). */
  addDebit: boolean
  debitName: string
  creditName: string | null
  money: {
    currencyCode: string
    numberLocale: string
    budgetRolloverDay: number
  }
  /** Tenant's settings before this run, used to send only fields that actually changed. */
  currentSettings: ExpenseSettings
}

/**
 * Builds the settings patch to send: only fields the wizard actually changed
 * from `currentSettings`, plus `defaultAccountId` when a new debit account was
 * created this run (there is nothing else it would make sense to default to).
 * An empty result means the caller should skip the update entirely.
 */
export function buildOnboardingSettingsPatch(
  input: Pick<OnboardingSetupInput, 'money' | 'currentSettings'>,
  newDebitId: number | null,
): Partial<ExpenseSettings> {
  const { money, currentSettings } = input
  const patch: Partial<ExpenseSettings> = {}
  if (money.currencyCode !== currentSettings.currencyCode) patch.currencyCode = money.currencyCode
  if (money.numberLocale !== currentSettings.numberLocale) patch.numberLocale = money.numberLocale
  if (money.budgetRolloverDay !== currentSettings.budgetRolloverDay) {
    patch.budgetRolloverDay = money.budgetRolloverDay
  }
  if (newDebitId != null) patch.defaultAccountId = newDebitId
  return patch
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

  let newDebitId: number | null = null
  if (input.addDebit) {
    const debit = await source.createAccount!({
      name: input.debitName.trim(),
      kind: 'debit',
      settlement: 'immediate',
      active: true,
    })
    applyPatch((d) => patchAfterAccount(d, debit))
    newDebitId = debit.id
  }

  if (input.creditName?.trim()) {
    const credit = await source.createAccount!({
      name: input.creditName.trim(),
      kind: 'credit',
      settlement: 'deferred',
      active: true,
    })
    applyPatch((d) => patchAfterAccount(d, credit))
  }

  const settingsPatch = buildOnboardingSettingsPatch(input, newDebitId)
  if (Object.keys(settingsPatch).length > 0) {
    const settings = await source.updateSettings!(settingsPatch)
    applyPatch((d) => patchAfterSettings(d, settings))
  }
}
