import { ConfirmSheet } from '../components/ConfirmSheet'
import { Presence } from '../components/Presence'
import { EXIT_MS } from '../hooks/motion'
import { OnboardingNav } from './OnboardingSteps'
import { OnboardingMoneyStep } from './OnboardingMoneyStep'
import { OnboardingCategoriesStep } from './OnboardingCategoriesStep'
import { OnboardingAccountsStep } from './OnboardingAccountsStep'
import { LAST_STEP } from './onboardingRules'
import { buildOnboardingConfirmSummary, ONBOARDING_CONFIRM_FOOTNOTE } from './onboardingConfirmSummary'
import type { OnboardingState } from './useOnboardingState'
import styles from './OnboardingWizard.module.css'

/** Whichever of the three steps is showing. */
export function OnboardingStepBody({ s, firstRun }: { s: OnboardingState; firstRun: boolean }) {
  const { step, accounts } = s
  return (
    <>
      {step === 0 ? (
        <OnboardingMoneyStep
          firstRun={firstRun}
          money={s.money}
          onChange={(patch) => s.setMoney((m) => ({ ...m, ...patch }))}
        />
      ) : null}
      {step === 1 ? (
        <OnboardingCategoriesStep
          drafts={s.drafts}
          onChange={s.setDrafts}
          currencySymbol={s.format.symbol}
          hasExistingCategories={s.hasExistingCategories}
        />
      ) : null}
      {step === 2 ? (
        <OnboardingAccountsStep
          hasExistingAccounts={s.hasExistingAccounts}
          addDebit={accounts.addDebit}
          debitName={accounts.debitName}
          creditName={accounts.creditName}
          addCredit={accounts.addCredit}
          onAddDebit={accounts.setAddDebit}
          onDebitName={accounts.setDebitName}
          onCreditName={accounts.setCreditName}
          onAddCredit={accounts.setAddCredit}
        />
      ) : null}
    </>
  )
}

/** Back, Continue or Finish, and the way out. */
export function OnboardingFooter({
  s,
  onNext,
  onSkip,
}: {
  s: OnboardingState
  onNext: () => void
  onSkip: () => void
}) {
  const { step, busy } = s
  const nextDisabled = step === 1 ? !s.canNextCategories : step === LAST_STEP ? !s.canFinish : false
  return (
    <>
      <OnboardingNav
        {...(step > 0
          ? {
              onBack: () => {
                s.setShowConfirm(false)
                s.setStep((n) => n - 1)
              },
            }
          : {})}
        onNext={onNext}
        nextLabel={step === LAST_STEP ? 'Finish setup' : 'Continue'}
        nextDisabled={nextDisabled}
        busy={busy}
      />
      <button type="button" className={styles.skipLink} onClick={onSkip} disabled={busy}>
        Skip for now
      </button>
    </>
  )
}

/** What a re-run is about to add, asked before it is added. */
export function OnboardingApplyConfirm({ s, onConfirm }: { s: OnboardingState; onConfirm: () => void }) {
  return (
    <Presence show={s.showConfirm} exitMs={EXIT_MS.sheet}>
      <ConfirmSheet
        title="Apply these changes?"
        message={buildOnboardingConfirmSummary({
          categories: s.selectedPresets,
          addDebit: s.addDebit,
          debitName: s.accounts.debitName,
          addCredit: s.accounts.addCredit,
          creditName: s.accounts.creditName,
          money: s.money,
          format: s.format,
        })}
        footnote={ONBOARDING_CONFIRM_FOOTNOTE}
        confirmLabel="Apply"
        onConfirm={onConfirm}
        onCancel={() => s.setShowConfirm(false)}
      />
    </Presence>
  )
}
