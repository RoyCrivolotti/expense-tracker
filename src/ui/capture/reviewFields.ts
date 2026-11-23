import type { NewTransaction } from '../../data/dataSource'
import type { RecommendationInfo } from '../../data/recommendationsApi'
import { cleanText } from '../../domain/capture/text'
import {
  bankMerchantName,
  merchantHistory,
  reviewReasons,
  type MerchantHistory,
  type MerchantIndex,
  type ReviewReason,
} from '../../domain/capture/review'
import { otherBudgetDays, paymentClock, type PaymentClock } from '../../domain/capture/reviewDates'
import type { TxnType } from '../../types'
import type { SeedCard, TransactionSeed } from '../actions'
import { suggestBudgetMonth } from '../components/transactionFormState'
import { monthEdgeNotice } from './reviewNotice'
import type { ExpenseModel } from '../useExpenseData'

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
  /** Days the bank might book it on that would be another budget month. Empty unless near an edge. */
  edgeDays: string[]
  reasons: ReviewReason[]
  /** True only when nothing is in doubt, so one tap may add it. */
  oneTap: boolean
}

/** The category and account the person's own history and settings give a payment, each null unless still in use. */
function knownReferences(
  categoryIdFromHistory: number | null,
  accountId: number | null,
  model: ExpenseModel,
) {
  const category = categoryIdFromHistory === null ? undefined : model.lookup.category(categoryIdFromHistory)
  const account = accountId === null ? undefined : model.lookup.account(accountId)
  return {
    categoryId: category?.active ? category.id : null,
    categoryName: category?.active ? category.name : null,
    accountId: account?.active ? account.id : null,
    accountName: account?.active ? account.name : null,
  }
}

/**
 * What the person's history says about the merchant. The server's suggestion when it names a description, since it
 * remembers what the person added this merchant with whatever they typed; else the rows the app holds, which match only
 * when a typed description equals the bank's text.
 */
function historyOf(
  rec: RecommendationInfo,
  merchants: MerchantIndex,
  bankText: string | null,
): MerchantHistory {
  const s = rec.suggestion
  if (s?.description != null)
    return { sightings: s.sightings, label: s.description, categoryId: s.categoryId, settled: s.settled }
  return merchantHistory(merchants, bankText)
}

/** The amount, type and account the push's wording taught, and its flags; without a suggestion, the push's first reading. */
function taught(rec: RecommendationInfo) {
  const s = rec.suggestion
  if (!s)
    return {
      amountCents: rec.amountCents,
      type: rec.suggestedType,
      accountId: rec.accountId,
      newShape: false,
      amountRelearned: false,
    }
  return {
    amountCents: s.amountCents,
    type: s.type,
    accountId: s.accountId,
    newShape: s.reasons.includes('new-shape'),
    amountRelearned: s.reasons.includes('amount-relearned'),
  }
}

/** Works out what a recommendation would become and whether one tap may add it. */
export function describeRecommendation(
  rec: RecommendationInfo,
  model: ExpenseModel,
  merchants: MerchantIndex,
): ReviewView {
  const bankText = rec.merchantRaw === null ? null : cleanText(rec.merchantRaw)
  const history = historyOf(rec, merchants, bankText)
  const { amountCents, type, accountId, newShape, amountRelearned } = taught(rec)
  const refs = knownReferences(history.categoryId, accountId, model)
  const clock = paymentClock(rec.occurredAt, rec.localDate, rec.createdAt)
  const monthOf = (day: string) => suggestBudgetMonth(model, day)
  const edgeDays = otherBudgetDays(monthOf, rec.localDate, clock.minuteOfDay, clock.arrivedDate)
  const reasons = reviewReasons({
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
  return {
    rec,
    askCard: refs.accountId === null && rec.card ? rec.card : null,
    type,
    amountCents,
    description: history.label ?? (bankText ? bankMerchantName(bankText) : ''),
    fromHistory: history.label !== null,
    ...refs,
    date: rec.localDate,
    time: clock.time,
    budgetMonth: monthOf(rec.localDate),
    clock,
    edgeDays,
    reasons,
    oneTap: reasons.length === 0,
  }
}

const noticeOf = (view: ReviewView) => {
  const notice = monthEdgeNotice(view)
  return notice ? { notice } : {}
}

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
