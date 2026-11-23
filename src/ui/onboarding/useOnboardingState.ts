import { useEffect, useMemo, useRef, useState } from 'react'
import type { ExpenseDataset } from '../../types'
import { formatMoneyInput, parseMoneyToCents, resolveMoneyFormat } from '../../engine/money'
import type { MoneyDraft } from './OnboardingMoneyStep'
import { buildSelectedPresets, useAccountsDraft, useCategoryDrafts } from './onboardingDrafts'
import { canFinishAccountsStep, canNextCategoriesStep, effectiveAddDebit, initialMoneyDraft } from './onboardingRules'

/** Everything the wizard remembers between steps, and what the choices so far add up to. */
export function useOnboardingState(dataset: ExpenseDataset) {
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [money, setMoney] = useState<MoneyDraft>(() => initialMoneyDraft(dataset.settings))
  const format = useMemo(
    () => resolveMoneyFormat(money.currencyCode, money.numberLocale),
    [money.currencyCode, money.numberLocale],
  )
  const hasExistingCategories = dataset.categories.length > 0
  const [drafts, setDrafts] = useCategoryDrafts(format, hasExistingCategories)
  const hasExistingAccounts = dataset.accounts.length > 0
  const accounts = useAccountsDraft(hasExistingAccounts)

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
  const canNextCategories = canNextCategoriesStep(selectedPresets.length, hasExistingCategories)
  const addDebit = effectiveAddDebit(hasExistingAccounts, accounts.addDebit)
  const canFinish = canFinishAccountsStep(
    hasExistingAccounts,
    addDebit,
    accounts.debitName,
    accounts.addCredit,
    accounts.creditName,
  )

  return {
    step,
    setStep,
    busy,
    setBusy,
    error,
    setError,
    showConfirm,
    setShowConfirm,
    money,
    setMoney,
    format,
    hasExistingCategories,
    drafts,
    setDrafts,
    hasExistingAccounts,
    accounts,
    selectedPresets,
    canNextCategories,
    addDebit,
    canFinish,
  }
}

export type OnboardingState = ReturnType<typeof useOnboardingState>
