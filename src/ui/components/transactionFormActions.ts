import type { Dispatch, SetStateAction } from 'react'
import { applyDescriptionSuggestion } from '../../data/applyDescriptionSuggestion'
import type { DescriptionSuggestion } from '../../data/descriptionIndex'
import type { ExpenseModel } from '../useExpenseData'
import type { FormFields } from './transactionFormState'

export function acceptDescriptionSuggestion(
  suggestion: DescriptionSuggestion,
  model: ExpenseModel,
  setForm: Dispatch<SetStateAction<FormFields>>,
) {
  setForm((f) => {
    const patch = applyDescriptionSuggestion(suggestion, model.dataset, {
      categoryId: f.categoryId,
      accountId: f.accountId,
    })
    return { ...f, ...patch }
  })
}
