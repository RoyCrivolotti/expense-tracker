import { TIP_IDS } from '../../domain/onboarding/tips'
import type { ExpenseModel } from '../useExpenseData'
import { TipCard } from './TipCard'

/** What the Transactions tab says on a person's first visit with a payment in it. */
export function TransactionsTips({ model, phone }: { model: ExpenseModel; phone: boolean }) {
  return (
    <TipCard id={TIP_IDS.transactions} title="Transactions" when={model.months.length > 0}>
      <p>{phone ? 'Tap a payment to change it. Swipe it left to copy or delete it.' : 'Click a payment to change it.'}</p>
      <p>{phone ? 'Hold one to select several and change them together.' : 'Use Select to pick several and change them together.'}</p>
      <p>Use Filters to find payments by category, account, flag, label or amount.</p>
    </TipCard>
  )
}

/** Under the Flagged heading, where a report starts: what the card is for, the first time a flagged payment exists. */
export function FlaggedTip({ present }: { present: boolean }) {
  return (
    <TipCard id={TIP_IDS.flagged} title="Flagged payments" when={present}>
      <p>Flagged payments collect here. Use Expense report to turn them into a document you can send.</p>
    </TipCard>
  )
}
