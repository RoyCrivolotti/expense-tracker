import type { ReactNode } from 'react'
import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { GuideHost } from '../guide/GuideHost'
import { TipsProvider } from './TipsProvider'

/** `TipsProvider` over what the app has loaded: the account's saved list, and whether it has a payment (`months` is the ledger's own answer). Also hosts the guide sheet that the tips and Help link to. */
export function ModelTips({
  model,
  actions,
  children,
}: {
  model: ExpenseModel
  actions: ExpenseActions | undefined
  children: ReactNode
}) {
  return (
    <TipsProvider
      saved={model.dataset.settings.tipsSeen}
      hasTransactions={model.months.length > 0}
      save={actions?.updateSettings}
    >
      <GuideHost>{children}</GuideHost>
    </TipsProvider>
  )
}
