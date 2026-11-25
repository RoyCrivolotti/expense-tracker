import type { ExpenseDataSource } from '../../data/dataSource'
import type { ExpenseDataset } from '../../types'
import { Modal } from '../components/Modal'
import { OnboardingProgress } from './OnboardingSteps'
import { OnboardingApplyConfirm, OnboardingFooter, OnboardingStepBody } from './OnboardingWizardParts'
import { dismissHandler, LAST_STEP, RERUN_FIRST_TITLE, TITLES } from './onboardingRules'
import { runOnboardingSetup } from './runOnboardingSetup'
import { useOnboardingState } from './useOnboardingState'
import styles from './OnboardingWizard.module.css'

interface OnboardingWizardProps {
  source: ExpenseDataSource
  dataset: ExpenseDataset
  applyPatch: (patch: (dataset: ExpenseDataset) => ExpenseDataset) => void
  /**
   * A first run has nothing to protect, so Finish applies at once. A re-run from Settings adds to
   * what exists, so it still shows what will be added and waits for a yes.
   */
  firstRun: boolean
  onDone: () => void
  onSkip: () => void
}

export function OnboardingWizard({ source, dataset, applyPatch, firstRun, onDone, onSkip }: OnboardingWizardProps) {
  const s = useOnboardingState(dataset)
  const { step, busy, showConfirm } = s

  async function finish() {
    if (busy) return
    s.setBusy(true)
    s.setError(null)
    try {
      await runOnboardingSetup(source, applyPatch, {
        categories: s.selectedPresets,
        addDebit: s.addDebit,
        debitName: s.accounts.debitName,
        creditName: s.accounts.addCredit ? s.accounts.creditName : null,
        money: s.money,
        currentSettings: dataset.settings,
        existingCategories: dataset.categories,
        firstRun,
      })
      onDone()
    } catch (err: unknown) {
      s.setError(err instanceof Error ? err.message : String(err))
    } finally {
      s.setBusy(false)
    }
  }

  function handleNext() {
    if (step < LAST_STEP) {
      s.setStep((n) => n + 1)
      return
    }
    if (firstRun) void finish()
    else s.setShowConfirm(true)
  }

  function handleConfirm() {
    s.setShowConfirm(false)
    void finish()
  }

  return (
    <Modal
      title={step === 0 && !firstRun ? RERUN_FIRST_TITLE : (TITLES[step] ?? 'Setup')}
      onClose={dismissHandler(showConfirm, () => s.setShowConfirm(false), onSkip)}
      trapPaused={showConfirm}
    >
      <OnboardingProgress step={step} />
      <OnboardingStepBody s={s} firstRun={firstRun} />
      {s.error ? <p className={styles.error}>{s.error}</p> : null}
      <OnboardingFooter s={s} onNext={handleNext} onSkip={onSkip} />
      <OnboardingApplyConfirm s={s} onConfirm={handleConfirm} />
    </Modal>
  )
}
