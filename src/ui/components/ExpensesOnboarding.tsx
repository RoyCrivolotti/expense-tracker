import type { ExpenseDataSource } from '../../data/dataSource'
import type { ExpenseDataset } from '../../types'
import { OnboardingWizard } from '../onboarding/OnboardingWizard'
import { skipOnboarding } from '../onboarding/onboardingStorage'

interface Props {
  open: boolean
  source: ExpenseDataSource
  dataset: ExpenseDataset
  /**
   * True only when this run auto-opened because the tenant had no categories
   * or accounts yet — false for a deliberate re-entry from Settings. Only a
   * genuine first-run completion should drop the user straight into "add a
   * transaction"; re-entry is usually just a currency/account tweak.
   */
  firstRun: boolean
  onAdd: () => void
  onClose: () => void
  applyPatch: (patch: (dataset: ExpenseDataset) => ExpenseDataset) => void
}

export function ExpensesOnboarding({
  open,
  source,
  dataset,
  firstRun,
  applyPatch,
  onAdd,
  onClose,
}: Props) {
  if (!open) return null
  return (
    <OnboardingWizard
      source={source}
      dataset={dataset}
      applyPatch={applyPatch}
      onDone={() => {
        onClose()
        if (firstRun) onAdd()
      }}
      onSkip={() => {
        skipOnboarding()
        onClose()
      }}
    />
  )
}
