import type { ExpenseSettings } from '../../types'
import type { MoneyDraft } from './OnboardingMoneyStep'

export const TITLES = ['Welcome', 'What do you spend on?', 'Where do you pay from?'] as const
/** A re-run is not a welcome, and has no first payment coming. */
export const RERUN_FIRST_TITLE = 'Setup'

export const LAST_STEP = TITLES.length - 1

export function initialMoneyDraft(settings: ExpenseSettings): MoneyDraft {
  return {
    currencyCode: settings.currencyCode,
    numberLocale: settings.numberLocale,
    budgetRolloverDay: settings.budgetRolloverDay,
  }
}

/**
 * Re-entry with existing accounts and the opt-in debit checkbox off never
 * needs a name; every other case (first run, or opted-in re-entry) does.
 * Checking "add a credit card" likewise requires a name — otherwise Finish
 * silently drops it (`runOnboardingSetup` skips creation when the name is
 * blank), with no feedback that nothing happened.
 */
export function canFinishAccountsStep(
  hasExistingAccounts: boolean,
  addDebit: boolean,
  debitName: string,
  addCredit: boolean,
  creditName: string,
): boolean {
  if (addCredit && creditName.trim().length === 0) return false
  if (hasExistingAccounts && !addDebit) return true
  return debitName.trim().length > 0
}

/**
 * First run must produce at least one category; re-entry may legitimately pass
 * through with none selected (e.g. just revisiting currency or accounts).
 */
export function canNextCategoriesStep(
  selectedCount: number,
  hasExistingCategories: boolean,
): boolean {
  return selectedCount > 0 || hasExistingCategories
}

/**
 * `accounts.addDebit` only tracks the opt-in checkbox, which is hidden once the tenant
 * has accounts. If accounts get deleted elsewhere while this wizard is open (another
 * tab, or via Settings), `hasExistingAccounts` goes stale — but a debit is still
 * mandatory whenever there are zero accounts, regardless of that checkbox's last value.
 */
export function effectiveAddDebit(
  hasExistingAccounts: boolean,
  addDebit: boolean,
): boolean {
  return hasExistingAccounts ? addDebit : true
}

/** While the confirm popup is open, dismissing the wizard chrome (Escape / backdrop) should close just the popup, not skip the whole wizard. */
export function dismissHandler(
  showConfirm: boolean,
  closeConfirm: () => void,
  onSkip: () => void,
): () => void {
  return showConfirm ? closeConfirm : onSkip
}
