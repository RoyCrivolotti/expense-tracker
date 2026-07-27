import type { CategoryPreset } from '../../domain/onboarding/presets'
import { formatCents, type MoneyFormat } from '../../engine/money'
import type { MoneyDraft } from './OnboardingMoneyStep'

export interface OnboardingConfirmSummaryInput {
  categories: CategoryPreset[]
  addDebit: boolean
  debitName: string
  addCredit: boolean
  creditName: string
  money: MoneyDraft
  format: MoneyFormat
}

/** Shown under the confirm popup's summary every time, regardless of content. */
export const ONBOARDING_CONFIRM_FOOTNOTE =
  "This adds to what you already have — it doesn't check for or merge duplicate categories or accounts."

function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return count === 1 ? singular : plural
}

/**
 * Plain-language summary of what "Finish setup" is about to do, built purely
 * from the wizard's current draft state — never reads the tenant's existing
 * categories/accounts, so it can't detect or warn about name collisions.
 */
export function buildOnboardingConfirmSummary(input: OnboardingConfirmSummaryInput): string[] {
  const lines: string[] = []

  if (input.categories.length > 0) {
    const names = input.categories.map((c) => c.name).join(', ')
    const noun = pluralize(input.categories.length, 'category', 'categories')
    lines.push(`${input.categories.length} new ${noun}: ${names}`)
  }

  const newAccountNames: string[] = []
  if (input.addDebit && input.debitName.trim()) newAccountNames.push(input.debitName.trim())
  if (input.addCredit && input.creditName.trim()) newAccountNames.push(input.creditName.trim())
  if (newAccountNames.length > 0) {
    const noun = pluralize(newAccountNames.length, 'account')
    lines.push(`${newAccountNames.length} new ${noun}: ${newAccountNames.join(', ')}`)
  }

  const preview = formatCents(1234567, input.format)
  lines.push(`Currency & number format: ${preview}, budget month starts on day ${input.money.budgetRolloverDay}`)

  return lines
}
