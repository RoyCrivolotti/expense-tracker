import type { SeriesFit } from '../../domain/capture/seriesMatch'
import type { SeedCard, SeedIntro, TransactionSeed } from '../actions'
import type { ReviewView } from './reviewFields'
import { seedOf } from './reviewFields'
import { dueOn } from './reviewFormat'

/** What a queued form does beyond showing its payment: the person's choices. */
export interface QueueSteps {
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

/**
 * The payments waiting for a look as an open form walks them: the list's latest views, in the list's order, less the
 * ones decided from the form. A saved payment stays in the views until the list is read again, and must not come back
 * under an arrow in the meantime. One put aside with "Don't add" leaves the views with the next views, and comes back
 * with them if it is undone; until those arrive it is left out here.
 */
export class WaitingList {
  private views: readonly ReviewView[] = []
  private readonly saved = new Set<string>()
  private aside = new Set<string>()
  private readonly listeners = new Set<() => void>()

  /**
   * The list's latest views. Tells whoever watches, so a form reads its place again. A saved payment is forgotten once
   * the list no longer has it. Until then it stays out of the arrows, even if the server took the save and still lists
   * it: the save said it was added, and showing it again would offer to add it twice.
   */
  set(views: readonly ReviewView[]): void {
    this.views = views
    this.aside = new Set()
    const listed = new Set(views.map((v) => v.rec.id))
    for (const id of this.saved) if (!listed.has(id)) this.saved.delete(id)
    this.tell()
  }

  saveOf(id: string): void {
    this.saved.add(id)
    this.tell()
  }

  putAside(id: string): void {
    this.aside.add(id)
    this.tell()
  }

  open(): ReviewView[] {
    return this.views.filter((v) => !this.saved.has(v.rec.id) && !this.aside.has(v.rec.id))
  }

  watch = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private tell(): void {
    for (const listener of [...this.listeners]) listener()
  }
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
 * The add form for one payment, placed in the list of payments waiting. Every step looks the payment up again in the
 * list as it stands, so a payment decided in the meantime is never shown, and one that arrived is counted. Deciding a
 * payment shows the one that takes its place, the one after it, or at the end of the list the one before, so none is
 * passed over. A payment two series fit opens with both offered, however it was reached, so moving on does not lose the
 * question the card asked.
 */
export function queuedSeed(
  view: ReviewView,
  list: WaitingList,
  steps: QueueSteps,
): TransactionSeed {
  const id = view.rec.id
  const place = () => {
    const views = list.open()
    return { views, i: views.findIndex((v) => v.rec.id === id) }
  }
  // Where it was last seen, for a payment that left the list under the form (decided on another device, say).
  let last = Math.max(0, place().i)
  const where = () => {
    const found = place()
    if (found.i >= 0) last = found.i
    return found
  }
  const open = (v: ReviewView | undefined) => (v ? queuedSeed(v, list, steps) : undefined)
  const successor = () => {
    const { views, i } = where()
    const rest = views.filter((v) => v.rec.id !== id)
    return rest[Math.min(i >= 0 ? i : last, rest.length - 1)]
  }
  return {
    ...seedOf(view, steps.rememberFor(view)),
    ...choiceOf(view, steps.choose),
    intro: steps.intro(view),
    queue: {
      spot: () => {
        const { views, i } = where()
        return { at: i + 1, of: views.length }
      },
      watch: list.watch,
      next: () => {
        const following = successor()
        list.saveOf(id)
        return open(following)
      },
      dontAdd: () => {
        const following = successor()
        list.putAside(id)
        steps.dontAdd(view)
        return open(following)
      },
      previous: () => {
        const { views, i } = where()
        return i > 0 ? open(views[i - 1]) : undefined
      },
      following: () => {
        const { views, i } = where()
        return i >= 0 ? open(views[i + 1]) : undefined
      },
    },
  }
}
