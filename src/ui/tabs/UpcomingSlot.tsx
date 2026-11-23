import type { ExpenseActions } from '../actions'
import { useReviewCore } from '../capture/reviewContext'
import type { ExpenseModel } from '../useExpenseData'
import { UpcomingCard } from './UpcomingCard'
import { useRecurringMarks } from './useRecurringMarks'
import { useUpcoming } from './useUpcoming'

/**
 * The Upcoming card on the Transactions tab, once its charges and what the bank pushes say about them are known. A
 * charge a waiting push stands for opens that push in the add form, through the To review list.
 */
export function UpcomingSlot({
  model,
  month,
  onAdd,
}: {
  model: ExpenseModel
  month: string
  onAdd: ExpenseActions['onAdd']
}) {
  const upcoming = useUpcoming(model, month)
  const recurring = useRecurringMarks(model, upcoming.suggestions)
  const core = useReviewCore()
  if (upcoming.suggestions.length === 0 || !recurring.ready) return null
  return (
    <UpcomingCard
      suggestions={recurring.suggestions}
      month={month}
      today={upcoming.today}
      lookup={model.lookup}
      // A push's form goes through the To review list, which sends any decision still waiting out its undo first.
      onAdd={(seed) => (seed.recommendationId && core ? core.openForm(seed) : onAdd(seed))}
    />
  )
}
