import type { SeriesFit } from '../../domain/capture/seriesMatch'
import type { SeedCard, SeedIntro, TransactionSeed } from '../actions'
import type { ReviewView } from './reviewFields'
import { seedOf } from './reviewFields'
import { dueOn } from './reviewFormat'

/** What a queued form does beyond showing its payment: reading the latest payments, and the person's choices. */
export interface QueueSteps {
  latest: () => readonly ReviewView[]
  dontAdd: (view: ReviewView) => void
  rememberFor: (view: ReviewView) => SeedCard['remember']
  /** Opens the form on the payment filled from one of the series its hint offers, which the person picked. */
  choose: (
    view: ReviewView,
    series: SeriesFit,
  ) => void
  /** What the form says above its fields for this payment: the bank's message and why it needs a look. */
  intro: (view: ReviewView) => SeedIntro
}

/** The series a payment may be, when more than one fits, as the form offers them: the person picks, never the app. */
function choiceOf(
  view: ReviewView,
  choose: QueueSteps['choose'],
): Pick<TransactionSeed, 'seriesChoice'> {
  if (view.hint?.kind !== 'choose') return {}
  return {
    seriesChoice: view.hint.series.map((s) => ({
      seriesKey: s.seriesKey,
      label: `${s.description}, ${dueOn(s.usualDate)}`,
      pick: () => choose(view, s),
    })),
  }
}

/**
 * The add form for one payment, with the ones after it queued behind. The queue is the ids that followed it when it
 * was opened; each step looks them up again in the latest views, so a payment decided in the meantime is skipped. A
 * payment two series fit opens with both offered, however it was reached, so moving on with "Add and next" does not
 * lose the question the card asked.
 */
export function queuedSeed(
  view: ReviewView,
  after: readonly string[],
  steps: QueueSteps,
): TransactionSeed {
  const { latest, dontAdd, rememberFor } = steps
  const stillOpen = (id: string) => latest().some((v) => v.rec.id === id)
  const next = (): TransactionSeed | undefined => {
    for (let i = 0; i < after.length; i++) {
      const found = latest().find((v) => v.rec.id === after[i])
      if (found) return queuedSeed(found, after.slice(i + 1), steps)
    }
    return undefined
  }
  return {
    ...seedOf(view, rememberFor(view)),
    ...choiceOf(view, steps.choose),
    intro: steps.intro(view),
    queue: {
      left: after.filter(stillOpen).length,
      next,
      dontAdd: () => {
        dontAdd(view)
        return next()
      },
    },
  }
}
