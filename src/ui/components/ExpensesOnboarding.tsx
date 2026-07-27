import type { ExpenseDataSource } from '../../data/dataSource'
import type { ExpenseDataset } from '../../types'
import { OnboardingWizard } from '../onboarding/OnboardingWizard'
import { skipOnboarding } from '../onboarding/onboardingStorage'

interface Props {
  open: boolean
  source: ExpenseDataSource
  dataset: ExpenseDataset
  onAdd: () => void
  onClose: () => void
  applyPatch: (patch: (dataset: ExpenseDataset) => ExpenseDataset) => void
}

export function ExpensesOnboarding({
  open,
  source,
  dataset,
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
        onAdd()
      }}
      onSkip={() => {
        skipOnboarding()
        onClose()
      }}
    />
  )
}
