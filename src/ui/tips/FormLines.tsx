import { showBudgetMonthLine, showDescriptionLine, showFirstPaymentLine } from '../../domain/onboarding/formTips'
import type { FormFields } from '../components/transactionFormState'
import type { ExpenseModel } from '../useExpenseData'
import { useHeldWhen } from '../hooks/usePresence'
import { FormTip } from './FormTip'
import { transactionCount, useFormLinesActive } from './useFormTips'

interface ModelProps {
  model: ExpenseModel
}

/** At the top of the form for a new payment: what is enough, until the account has one. */
export function FirstPaymentLine({ model, editing }: ModelProps & { editing: boolean }) {
  const active = useFormLinesActive()
  return (
    <FormTip show={active && showFirstPaymentLine(transactionCount(model), editing)} tone="line">
      Add your first transaction. An amount, a description and a category are enough. The rest can wait.
    </FormTip>
  )
}

/** Under Description, where the suggestions are, for a person's first payments. */
export function DescriptionLine({ model, editing }: ModelProps & { editing: boolean }) {
  const active = useFormLinesActive()
  return (
    <FormTip show={active && showDescriptionLine(transactionCount(model), editing)} tone="hint">
      Use the same name each time for the same shop. Suggestions and Analytics group by it.
    </FormTip>
  )
}

/** Under the budget month, when it is not the date's month, for a person's first payments. */
export function BudgetMonthLine({ model, form, editing }: ModelProps & { form: Pick<FormFields, 'date' | 'budgetMonth'>; editing: boolean }) {
  const active = useFormLinesActive()
  return (
    <FormTip show={active && showBudgetMonthLine(transactionCount(model), form.date, form.budgetMonth, editing)} tone="hint">
      Which month&rsquo;s budget this counts in. Usually the month of the date.
    </FormTip>
  )
}

/** Under the type buttons, for the types that need a word. It folds in and out like the other lines, and keeps its words while it goes. */
export function TypeHintLine({ hint }: { hint: string | null }) {
  const held = useHeldWhen(hint, hint === null)
  return (
    <FormTip show={hint !== null} tone="hint">
      {held}
    </FormTip>
  )
}
