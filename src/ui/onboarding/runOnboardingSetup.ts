import type { Category, ExpenseDataset, ExpenseSettings } from '../../types'
import type { ExpenseDataSource } from '../../data/dataSource'
import type { CategoryPreset } from '../../domain/onboarding/presets'
import {
  patchAfterAccount,
  patchAfterAccountDelete,
  patchAfterCategory,
  patchAfterCategoryDelete,
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
  /**
   * Tenant's categories before this run, used only to seed new categories'
   * `sortOrder` after whatever already exists — on re-entry these would
   * otherwise start back at 0 and interleave with (or precede) existing ones.
   */
  existingCategories: Category[]
}

/**
 * Builds the settings patch to send: only fields the wizard actually changed
 * from `currentSettings`, plus `defaultAccountId` when a new debit account was
 * created this run *and* the tenant didn't already have a default configured.
 * Re-entry opting into an extra debit account must not silently steal
 * "default" away from whichever account the tenant already relies on.
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
  if (newDebitId != null && currentSettings.defaultAccountId == null) {
    patch.defaultAccountId = newDebitId
  }
  return patch
}

/**
 * Best-effort undo for whatever `runOnboardingSetup` already created before a
 * later step failed — there's no single backend endpoint spanning categories,
 * accounts, and settings, so this can't be a real transaction. Each created
 * record is fresh and unused (the setup loop that made it hasn't finished),
 * so a plain delete is always safe here — no reassign target needed. Errors
 * during cleanup are swallowed: the error that matters to the caller is the
 * original setup failure, not a secondary cleanup failure.
 */
async function rollbackOnboardingSetup(
  source: ExpenseDataSource,
  applyPatch: (patch: (dataset: ExpenseDataset) => ExpenseDataset) => void,
  createdCategoryIds: number[],
  createdAccountIds: number[],
): Promise<void> {
  for (const id of createdCategoryIds) {
    try {
      await source.deleteCategory!(id)
      applyPatch((d) => patchAfterCategoryDelete(d, id, { reassignedToId: null }))
    } catch {
      /* best-effort; the original setup error is what the caller should see */
    }
  }
  for (const id of createdAccountIds) {
    try {
      await source.deleteAccount!(id)
      applyPatch((d) => patchAfterAccountDelete(d, id, { reassignedToId: null }))
    } catch {
      /* best-effort; the original setup error is what the caller should see */
    }
  }
}

export async function runOnboardingSetup(
  source: ExpenseDataSource,
  applyPatch: (patch: (dataset: ExpenseDataset) => ExpenseDataset) => void,
  input: OnboardingSetupInput,
): Promise<void> {
  const createdCategoryIds: number[] = []
  const createdAccountIds: number[] = []
  try {
    let sortOrder = input.existingCategories.reduce((max, c) => Math.max(max, c.sortOrder + 1), 0)
    for (const preset of input.categories) {
      const category = await source.createCategory!({
        name: preset.name,
        icon: preset.icon,
        monthlyBudgetCents: preset.defaultBudgetCents,
        sortOrder: sortOrder++,
        active: true,
      })
      createdCategoryIds.push(category.id)
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
      createdAccountIds.push(debit.id)
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
      createdAccountIds.push(credit.id)
      applyPatch((d) => patchAfterAccount(d, credit))
    }

    const settingsPatch = buildOnboardingSettingsPatch(input, newDebitId)
    if (Object.keys(settingsPatch).length > 0) {
      const settings = await source.updateSettings!(settingsPatch)
      applyPatch((d) => patchAfterSettings(d, settings))
    }
  } catch (err) {
    await rollbackOnboardingSetup(source, applyPatch, createdCategoryIds, createdAccountIds)
    throw err
  }
}
