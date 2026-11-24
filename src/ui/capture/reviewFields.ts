import type { NewTransaction } from '../../data/dataSource'
import type { RecommendationInfo } from '../../data/recommendationsApi'
import type { SeriesHint } from '../../domain/capture/seriesMatch'
import { cleanText } from '../../domain/capture/text'
import { bankMerchantName, reviewReasons, type MerchantIndex, type ReviewReason } from '../../domain/capture/review'
import {
  messageDating,
  otherBudgetDays,
  paymentClock,
  type MessageDating,
  type PaymentClock,
} from '../../domain/capture/reviewDates'
import type { TxnType } from '../../types'
import type { SeedCard, TransactionSeed } from '../actions'
import { suggestBudgetMonth } from '../components/transactionFormState'
import { messageDateNotice, monthEdgeNotice } from './reviewNotice'
import type { ExpenseModel } from '../useExpenseData'
import { historyOf, taught } from './reviewReading'
import { NO_HINT, seriesReading } from './reviewSeries'

/** The seven things a payment becomes, worked out from the push and the person's own history. Never stored. */
export interface ReviewView {
  rec: RecommendationInfo
  /** The card to ask about: the push showed one and it is not linked to an account that exists. */
  askCard: { source: string; digits: string } | null
  type: TxnType | null
  amountCents: number | null
  /**
   * The person's own description for the merchant, from the server's memory of what they added it with, else from the
   * rows the app holds; else the bank's text cleaned, else empty.
   */
  description: string
  /** True when the description is how the person named this merchant before, not the bank's own text. */
  fromHistory: boolean
  categoryId: number | null
  categoryName: string | null
  accountId: number | null
  accountName: string | null
  date: string
  /** `HH:MM` on the phone's clock, or null when the phone's offset is unknown. */
  time: string | null
  budgetMonth: string
  /** The phone's own clock for the payment and its push. */
  clock: PaymentClock
  /** When the push arrived, if its words dated the payment another day. Null when the date is the arrival's. */
  fromMessage: MessageDating | null
  /** Days the bank might book it on that would be another budget month. Empty unless near an edge. */
  edgeDays: string[]
  reasons: ReviewReason[]
  /** True only when nothing is in doubt, so one tap may add it. */
  oneTap: boolean
  /** The monthly series the payment may be, or null when none fits. A hint for the person, never a decision. */
  hint: Exclude<SeriesHint, { kind: 'none' }> | null
  /**
   * The account the hinted series is paid from, named when the fields would not show it: a series on another account
   * than the push's, or a push that named no account. Null otherwise.
   */
  hintAccount: string | null
}

/**
 * Works out what a recommendation would become and whether one tap may add it. A `hint` naming a series fills the
 * description, category and type from it, and the account too when the push named none and has no card to ask about.
 * A filled payment always goes through review: the first time a bank text is matched, nothing is added by one tap.
 */
export function describeRecommendation(
  rec: RecommendationInfo,
  model: ExpenseModel,
  merchants: MerchantIndex,
  hint: SeriesHint = NO_HINT,
): ReviewView {
  const bankText = rec.merchantRaw === null ? null : cleanText(rec.merchantRaw)
  const history = historyOf(rec, merchants, bankText)
  const pushed = taught(rec)
  const { amountCents, newShape, amountRelearned } = pushed
  const { fill, type, refs, askCard, ...hinted } = seriesReading(hint, history, pushed, rec, model)
  const clock = paymentClock(rec.occurredAt, rec.localDate, rec.createdAt)
  const monthOf = (day: string) => suggestBudgetMonth(model, day)
  const fromMessage = messageDating(rec.occurredAt, rec.localDate)
  // A day the bank wrote is the day it books: no day either side of it is in question.
  const edgeDays = fromMessage ? [] : otherBudgetDays(monthOf, rec.localDate, clock.minuteOfDay, clock.arrivedDate)
  const found = reviewReasons({
    amountCents,
    currency: rec.currency,
    hasMerchant: !!bankText,
    categoryId: refs.categoryId,
    accountId: refs.accountId,
    suggestedType: type,
    sightings: history.sightings,
    settled: history.settled,
    monthEdge: edgeDays.length > 0,
    possibleMatch: rec.possibleMatch != null,
    newShape,
    amountRelearned,
  })
  // A bank text seen for the first time is no news once a series has named the payment: the hint says what it is.
  const reasons = fill ? found.filter((r) => r !== 'new-merchant') : found
  return {
    rec,
    askCard,
    type,
    amountCents,
    description: fill?.description ?? history.label ?? (bankText ? bankMerchantName(bankText) : ''),
    fromHistory: !fill && history.label !== null,
    ...refs,
    date: rec.localDate,
    time: clock.time,
    budgetMonth: monthOf(rec.localDate),
    clock,
    fromMessage,
    edgeDays,
    reasons,
    // Two series are always the person's to choose between: votes never pick one by a tap.
    oneTap: reasons.length === 0 && !fill && hint.kind !== 'choose',
    ...hinted,
  }
}

const noticeOf = (view: ReviewView) => {
  const notice = monthEdgeNotice(view) ?? messageDateNotice(view)
  return notice ? { notice } : {}
}

/** The one series the fields were filled from, if any. Two series fill nothing. */
const seriesOf = (view: ReviewView) =>
  view.hint && view.hint.kind !== 'choose' ? { fromSeries: view.hint.series.seriesKey } : {}

/** What the add form opens with. Nothing the push could not say is filled in, and the form shows the rest. */
export function seedOf(
  view: ReviewView,
  remember?: SeedCard['remember'],
): TransactionSeed {
  const foreign = view.reasons.includes('foreign')
  return {
    recommendationId: view.rec.id,
    date: view.date,
    budgetMonth: view.budgetMonth,
    // Cents in another currency are not euros: the person types what the bank charged.
    ...(view.amountCents !== null && !foreign ? { amountCents: view.amountCents } : {}),
    ...(view.type ? { type: view.type } : {}),
    // How the person typed this merchant before, else the bank's own text without its store number.
    ...(view.description ? { description: view.description } : {}),
    // 0 is the form's "nothing chosen" sentinel: a card to ask about starts with no account rather than a default.
    ...(view.accountId !== null ? { accountId: view.accountId } : view.askCard && remember ? { accountId: 0 } : {}),
    // Same sentinel for the category: without a suggestion the form would open on its first category, and one tap
    // would file the payment under a category nobody chose.
    categoryId: view.categoryId ?? 0,
    ...noticeOf(view),
    ...(view.rec.possibleMatch ? { possibleMatch: view.rec.possibleMatch } : {}),
    ...seriesOf(view),
    ...(view.askCard && remember
      ? {
          card: {
            ...view.askCard,
            answer: { accountId: null, remember: true },
            unanswered: `Choose the account for the card ending ${view.askCard.digits} first`,
            remember,
          },
        }
      : {}),
  }
}

/** The transaction one tap adds. Null unless one tap is allowed, so a caller cannot add a payment in doubt. */
export function transactionOf(view: ReviewView): NewTransaction | null {
  const { type, amountCents, accountId, categoryId } = view
  if (
    !view.oneTap ||
    type === null ||
    type === 'investment' ||
    amountCents === null ||
    accountId === null ||
    categoryId === null
  )
    return null
  return {
    date: view.date,
    budgetMonth: view.budgetMonth,
    description: view.description,
    accountId,
    categoryId,
    type,
    amountCents,
    cancelled: false,
    flagId: null,
  }
}
