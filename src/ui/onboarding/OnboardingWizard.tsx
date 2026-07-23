import { useEffect, useMemo, useRef, useState } from 'react'
import type { ExpenseDataSource } from '../../data/dataSource'
import type { ExpenseDataset } from '../../types'
import { defaultExpenseSettings } from '../../engine'
import { formatMoneyInput, parseMoneyToCents, resolveMoneyFormat } from '../../engine/money'
import { Modal } from '../components/Modal'
import { OnboardingNav, OnboardingProgress } from './OnboardingSteps'
import { OnboardingMoneyStep, type MoneyDraft } from './OnboardingMoneyStep'
import { OnboardingCategoriesStep } from './OnboardingCategoriesStep'
import { OnboardingAccountsStep } from './OnboardingAccountsStep'
import {
  buildSelectedPresets,
  useAccountsDraft,
  useCategoryDrafts,
} from './onboardingDrafts'
import { runOnboardingSetup } from './runOnboardingSetup'
import styles from './OnboardingWizard.module.css'

const TITLES = [
  'Welcome to Expenses',
  'Money & months',
  'Choose categories',
  'Add accounts',
] as const

const LAST_STEP = TITLES.length - 1

function initialMoneyDraft(): MoneyDraft {
  const s = defaultExpenseSettings()
  return {
    currencyCode: s.currencyCode,
    numberLocale: s.numberLocale,
    budgetRolloverDay: s.budgetRolloverDay,
  }
}

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
  const [money, setMoney] = useState<MoneyDraft>(initialMoneyDraft)
  const format = useMemo(
    () => resolveMoneyFormat(money.currencyCode, money.numberLocale),
    [money.currencyCode, money.numberLocale],
  )
  const [drafts, setDrafts] = useCategoryDrafts(format)
  const accounts = useAccountsDraft()

  // Category budgets are stored as display strings, so when the chosen format
  // changes we re-render each amount from the value it held under the old
  // format. Without this a comma-decimal budget would be misread after a
  // switch to a dot-decimal currency.
  const prevFormat = useRef(format)
  useEffect(() => {
    if (prevFormat.current === format) return
    const previous = prevFormat.current
    setDrafts((rows) =>
      rows.map((d) => ({
        ...d,
        budgetEuros: formatMoneyInput(parseMoneyToCents(d.budgetEuros, previous), format),
      })),
    )
    prevFormat.current = format
  }, [format, setDrafts])

  const selectedPresets = buildSelectedPresets(drafts, format)
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
        money,
      })
      onDone()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function handleNext() {
    if (step < LAST_STEP) {
      setStep((s) => s + 1)
      return
    }
    void finish()
  }

  const nextDisabled = step === 2 ? !canNextCategories : step === LAST_STEP ? !canFinish : false

  return (
    <Modal title={TITLES[step] ?? 'Setup'} onClose={onSkip}>
      <OnboardingProgress step={step} />
      {step === 0 ? (
        <div className={styles.stepBody}>
          <p className={styles.lead}>
            Set up your currency, categories, and accounts so you can log spending. Your data stays
            private to your account.
          </p>
          <p className={styles.hint}>
            This takes about a minute. Spending is grouped into budget months, which you can align
            to the calendar or your own pay cycle. You can skip and configure everything later in
            Settings.
          </p>
        </div>
      ) : null}
      {step === 1 ? (
        <OnboardingMoneyStep money={money} onChange={(patch) => setMoney((m) => ({ ...m, ...patch }))} />
      ) : null}
      {step === 2 ? (
        <OnboardingCategoriesStep drafts={drafts} onChange={setDrafts} currencySymbol={format.symbol} />
      ) : null}
      {step === 3 ? (
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
        nextLabel={step === LAST_STEP ? 'Finish setup' : 'Continue'}
        nextDisabled={nextDisabled}
        busy={busy}
      />
      <button type="button" className={styles.skipLink} onClick={onSkip} disabled={busy}>
        Skip for now
      </button>
    </Modal>
  )
}
