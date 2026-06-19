import { useState } from 'react'
import type { ExpenseDataSource } from '../../data/dataSource'
import type { ExpenseDataset } from '../../types'
import { Modal } from '../components/Modal'
import { OnboardingNav, OnboardingProgress } from './OnboardingSteps'
import { OnboardingCategoriesStep } from './OnboardingCategoriesStep'
import { OnboardingAccountsStep } from './OnboardingAccountsStep'
import {
  buildSelectedPresets,
  useAccountsDraft,
  useCategoryDrafts,
} from './onboardingDrafts'
import { runOnboardingSetup } from './runOnboardingSetup'
import styles from './OnboardingWizard.module.css'

const TITLES = ['Welcome to Expenses', 'Choose categories', 'Add accounts'] as const

interface OnboardingWizardProps {
  source: ExpenseDataSource
  applyPatch: (patch: (dataset: ExpenseDataset) => ExpenseDataset) => void
  onDone: () => void
  onSkip: () => void
}

export function OnboardingWizard({ source, applyPatch, onDone, onSkip }: OnboardingWizardProps) {
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useCategoryDrafts()
  const accounts = useAccountsDraft()

  const selectedPresets = buildSelectedPresets(drafts)
  const canNextCategories = selectedPresets.length > 0
  const canFinish = accounts.debitName.trim().length > 0

  async function finish() {
    setBusy(true)
    setError(null)
    try {
      await runOnboardingSetup(source, applyPatch, {
        categories: selectedPresets,
        debitName: accounts.debitName,
        creditName: accounts.addCredit ? accounts.creditName : null,
      })
      onDone()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function handleNext() {
    if (step === 0) {
      setStep(1)
      return
    }
    if (step === 1) {
      setStep(2)
      return
    }
    void finish()
  }

  return (
    <Modal title={TITLES[step] ?? 'Setup'} onClose={onSkip}>
      <OnboardingProgress step={step} />
      {step === 0 ? (
        <div className={styles.stepBody}>
          <p className={styles.lead}>
            Set up categories and accounts so you can log spending. Your data stays private to
            your account.
          </p>
          <p className={styles.hint}>This takes about a minute. You can skip and configure later
            in Settings.</p>
        </div>
      ) : null}
      {step === 1 ? <OnboardingCategoriesStep drafts={drafts} onChange={setDrafts} /> : null}
      {step === 2 ? (
        <OnboardingAccountsStep
          debitName={accounts.debitName}
          creditName={accounts.creditName}
          addCredit={accounts.addCredit}
          onDebitName={accounts.setDebitName}
          onCreditName={accounts.setCreditName}
          onAddCredit={accounts.setAddCredit}
        />
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      <OnboardingNav
        {...(step > 0 ? { onBack: () => setStep((s) => s - 1) } : {})}
        onNext={handleNext}
        nextLabel={step === 2 ? 'Finish setup' : 'Continue'}
        nextDisabled={step === 1 ? !canNextCategories : step === 2 ? !canFinish : false}
        busy={busy}
      />
      <button type="button" className={styles.skipLink} onClick={onSkip} disabled={busy}>
        Skip for now
      </button>
    </Modal>
  )
}
